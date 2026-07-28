import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  HttpCode,
  Injectable,
  Param,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import {
  dtmfRequestSchema,
  holdRequestSchema,
  originateRequestSchema,
  transferRequestSchema,
} from '@aicc/shared';
import { z } from 'zod';
import { AsteriskTelephonyProvider } from './asterisk.provider';
import { CallRegistry } from './call-session';
import { safeEqual } from '../common/crypto';

/**
 * Telefoniya servisi tashqi tarmoqqa chiqarilmaydi — unga faqat Core API
 * murojaat qiladi va so'rovlar umumiy sir bilan imzolanadi.
 */
@Injectable()
class ServiceTokenGuard implements CanActivate {
  private readonly token: string;

  constructor(config: ConfigService) {
    this.token = config.getOrThrow<string>('SERVICE_TOKEN');
  }

  canActivate(context: ExecutionContext): boolean {
    const header = context.switchToHttp().getRequest<Request>().get('x-aicc-service-token');
    if (!safeEqual(header, this.token)) throw new UnauthorizedException("Servis tokeni noto'g'ri");
    return true;
  }
}

const spySchema = z.object({
  supervisorExtension: z.string().min(3),
  mode: z.enum(['listen', 'whisper', 'barge']),
});

const mediaForkSchema = z.object({
  host: z.string(),
  port: z.number().int().min(1).max(65535),
  format: z.enum(['slin', 'slin16', 'ulaw', 'alaw']).default('slin16'),
  transport: z.enum(['audiosocket', 'externalmedia']).default('audiosocket'),
});

/** Docker / lokal probe — SERVICE_TOKEN talab qilmaydi (faqat ichki tarmoq). */
@Controller('telephony')
export class TelephonyHealthController {
  constructor(private readonly provider: AsteriskTelephonyProvider) {}

  @Get('health')
  health() {
    return this.provider.healthCheck();
  }
}

@Controller('telephony')
@UseGuards(ServiceTokenGuard)
export class TelephonyController {
  constructor(
    private readonly provider: AsteriskTelephonyProvider,
    private readonly registry: CallRegistry,
  ) {}

  @Get('calls')
  activeCalls() {
    return this.registry.list().map((session) => ({
      callId: session.callId,
      tenantId: session.tenantId,
      direction: session.direction,
      state: session.state,
      from: session.fromNumber,
      to: session.toNumber,
      operatorId: session.operatorId,
      contactId: session.contactId,
      queueId: session.queueId,
      startedAt: session.startedAt.toISOString(),
      answeredAt: session.answeredAt?.toISOString(),
      durationSec: CallRegistry.durationSec(session),
      talkTimeSec: CallRegistry.talkTimeSec(session),
      hasMediaFork: session.mediaForkChannelIds.length > 0,
      recordingName: session.recordingName,
    }));
  }

  @Post('calls/originate')
  async originate(@Body() body: unknown) {
    const request = originateRequestSchema.parse(body);
    const callId = await this.provider.originate(request);
    return { callId };
  }

  @Post('calls/:callId/answer')
  @HttpCode(204)
  async answer(@Param('callId') callId: string): Promise<void> {
    await this.provider.answer(callId);
  }

  @Post('calls/:callId/hangup')
  @HttpCode(204)
  async hangup(@Param('callId') callId: string): Promise<void> {
    await this.provider.hangup(callId);
  }

  @Post('calls/:callId/hold')
  @HttpCode(204)
  async hold(@Param('callId') callId: string, @Body() body: unknown): Promise<void> {
    const { on } = holdRequestSchema.parse({ ...(body as object), callId });
    await this.provider.hold(callId, on);
  }

  @Post('calls/:callId/mute')
  @HttpCode(204)
  async mute(@Param('callId') callId: string, @Body() body: unknown): Promise<void> {
    const { on } = z.object({ on: z.boolean() }).parse(body);
    await this.provider.mute(callId, on);
  }

  @Post('calls/:callId/transfer')
  @HttpCode(204)
  async transfer(@Param('callId') callId: string, @Body() body: unknown): Promise<void> {
    const request = transferRequestSchema.parse({ ...(body as object), callId });
    await this.provider.transfer(request);
  }

  @Post('calls/:callId/dtmf')
  @HttpCode(204)
  async dtmf(@Param('callId') callId: string, @Body() body: unknown): Promise<void> {
    const { digits } = dtmfRequestSchema.parse({ ...(body as object), callId });
    await this.provider.sendDtmf(callId, digits);
  }

  @Post('calls/:callId/recording/start')
  async startRecording(@Param('callId') callId: string) {
    return { name: await this.provider.startRecording(callId) };
  }

  @Post('calls/:callId/recording/stop')
  @HttpCode(204)
  async stopRecording(@Param('callId') callId: string): Promise<void> {
    await this.provider.stopRecording(callId);
  }

  @Post('calls/:callId/media-fork/start')
  async startMediaFork(@Param('callId') callId: string, @Body() body: unknown) {
    const sink = mediaForkSchema.parse(body);
    const channels = await this.provider.startMediaFork(callId, sink);
    return { channels };
  }

  @Post('calls/:callId/media-fork/stop')
  @HttpCode(204)
  async stopMediaFork(@Param('callId') callId: string): Promise<void> {
    await this.provider.stopMediaFork(callId);
  }

  @Post('calls/:callId/spy')
  @HttpCode(204)
  async spy(@Param('callId') callId: string, @Body() body: unknown): Promise<void> {
    const { supervisorExtension, mode } = spySchema.parse(body);
    await this.provider.spy(callId, supervisorExtension, mode);
  }
}

export { ServiceTokenGuard };
