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
import type { JwtPayload } from '../auth/auth.types';

interface SocketData {
  userId: string;
  tenantId: string;
  roles: Role[];
}

/**
 * Brauzerga real vaqtdagi hodisalarni uzatadi.
 * Har bir ulanish JWT bilan tekshiriladi va faqat o'z tenant xonasiga qo'shiladi;
 * operator qo'shimcha ravishda shaxsiy xonasini oladi, supervisor esa
 * "jonli devor" xonasini.
 */
@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token =
      (client.handshake.auth as { token?: string })?.token ??
      client.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');

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

    const data: SocketData = {
      userId: payload.sub,
      tenantId: payload.tid,
      roles: payload.roles,
    };
    client.data = data;

    await client.join(socketRooms.tenant(data.tenantId));
    await client.join(socketRooms.user(data.userId));
    if (hasPermission(data.roles, 'call:read:all')) {
      await client.join(socketRooms.liveWall(data.tenantId));
    }

    this.logger.debug(`Ulandi: ${payload.email} (${client.id})`);
  }

  handleDisconnect(client: Socket): void {
    const data = client.data as SocketData | undefined;
    if (data) this.logger.debug(`Uzildi: ${data.userId} (${client.id})`);
  }

  /**
   * Hodisani kerakli xonalarga yuboradi. Operatorga tegishli qo'ng'iroq bo'lsa
   * uning shaxsiy xonasiga, nazorat uchun esa "jonli devor" xonasiga boradi.
   */
  emitEvent(event: AiccEvent, operatorId?: string): void {
    if (!this.server) return;

    const rooms: string[] = [socketRooms.liveWall(event.tenantId)];
    if (operatorId) {
      rooms.push(socketRooms.user(operatorId));
    } else {
      // Egasi aniq bo'lmagan hodisalar (SMS, qurilma holati) butun tenantga.
      rooms.push(socketRooms.tenant(event.tenantId));
    }

    this.server.to(rooms).emit(SOCKET_EVENT, event);
  }

  /** Aniq foydalanuvchiga yuborish (masalan, screen-pop). */
  emitToUser(userId: string, event: AiccEvent): void {
    this.server?.to(socketRooms.user(userId)).emit(SOCKET_EVENT, event);
  }

  countConnections(): number {
    return this.server?.sockets.sockets.size ?? 0;
  }
}
