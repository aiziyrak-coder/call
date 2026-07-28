import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { SOCKET_EVENT, hasPermission, socketRooms, AiccEvent, Role } from '@aicc/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from '../auth/auth.types';
import { ACCESS_COOKIE } from '../auth/auth-cookies';

interface SocketData {
  userId: string;
  tenantId: string;
  roles: Role[];
}

function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

/**
 * Brauzerga real vaqtdagi hodisalarni uzatadi.
 * Har bir ulanish JWT bilan tekshiriladi; rollar bazadan olinadi.
 */
@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((o) => o.trim()),
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly corsOrigins: string[];

  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.corsOrigins = this.config
      .get<string>('CORS_ORIGINS', 'http://localhost:3000')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  }

  async handleConnection(client: Socket): Promise<void> {
    const origin = client.handshake.headers.origin;
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    if (isProd && !origin) {
      client.disconnect(true);
      return;
    }
    if (origin && this.corsOrigins.length > 0 && !this.corsOrigins.includes(origin)) {
      client.disconnect(true);
      return;
    }

    const token =
      (client.handshake.auth as { token?: string })?.token ??
      client.handshake.headers.authorization?.replace(/^Bearer\s+/i, '') ??
      parseCookie(client.handshake.headers.cookie, ACCESS_COOKIE);

    if (!token) {
      client.disconnect(true);
      return;
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.getOrThrow('JWT_SECRET'),
      });
    } catch {
      client.disconnect(true);
      return;
    }

    if (!payload.mfa) {
      client.disconnect(true);
      return;
    }

    // Rollar JWT dan emas — bazadan (revocation / role change).
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, tenantId: payload.tid, isActive: true },
      select: { id: true, tenantId: true, roles: true, email: true },
    });
    if (!user) {
      client.disconnect(true);
      return;
    }

    const data: SocketData = {
      userId: user.id,
      tenantId: user.tenantId,
      roles: user.roles as Role[],
    };
    client.data = data;

    await client.join(socketRooms.tenant(data.tenantId));
    await client.join(socketRooms.user(data.userId));
    if (hasPermission(data.roles, 'call:read:all')) {
      await client.join(socketRooms.liveWall(data.tenantId));
    }

    this.logger.debug(`Ulandi: ${user.email} (${client.id})`);
  }

  handleDisconnect(client: Socket): void {
    const data = client.data as SocketData | undefined;
    if (data) this.logger.debug(`Uzildi: ${data.userId} (${client.id})`);
  }

  emitEvent(event: AiccEvent, operatorId?: string): void {
    if (!this.server) return;

    const rooms: string[] = [socketRooms.liveWall(event.tenantId)];
    if (operatorId) {
      rooms.push(socketRooms.user(operatorId));
    } else {
      rooms.push(socketRooms.tenant(event.tenantId));
    }

    this.server.to(rooms).emit(SOCKET_EVENT, event);
  }

  emitToUser(userId: string, event: AiccEvent): void {
    this.server?.to(socketRooms.user(userId)).emit(SOCKET_EVENT, event);
  }

  countConnections(): number {
    return this.server?.sockets.sockets.size ?? 0;
  }
}
