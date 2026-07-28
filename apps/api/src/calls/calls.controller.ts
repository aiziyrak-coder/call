import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { e164Schema } from '@aicc/shared';
import { CallsService } from './calls.service';
import { Audit, CurrentUser, RequirePermissions } from '../auth/decorators';
import { paginationSchema } from '../common/pagination';
import { ZodQuery, createZodDto } from '../common/zod';
import type { AuthUser } from '../auth/auth.types';

const callFiltersSchema = paginationSchema.extend({
  direction: z.enum(['INBOUND', 'OUTBOUND', 'INTERNAL']).optional(),
  disposition: z
    .enum(['ANSWERED', 'NO_ANSWER', 'BUSY', 'FAILED', 'ABANDONED', 'VOICEMAIL'])
    .optional(),
  operatorId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  queueId: z.string().uuid().optional(),
  search: z.string().max(64).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const originateSchema = z.object({
  to: z.union([e164Schema, z.string().min(3).max(20)]),
  contactId: z.string().uuid().optional(),
  operatorId: z.string().uuid().optional(),
});
class OriginateDto extends createZodDto(originateSchema) {}

const transferSchema = z.object({
  target: z.string().min(3),
  mode: z.enum(['blind', 'attended']).default('blind'),
});
class TransferDto extends createZodDto(transferSchema) {}

const dtmfSchema = z.object({
  digits: z
    .string()
    .regex(/^[0-9*#A-D]+$/)
    .max(32),
});
class DtmfDto extends createZodDto(dtmfSchema) {}

const spySchema = z.object({ mode: z.enum(['listen', 'whisper', 'barge']) });
class SpyDto extends createZodDto(spySchema) {}

const noteSchema = z.object({ notes: z.string().max(4000) });
class NoteDto extends createZodDto(noteSchema) {}

@ApiTags('calls')
@Controller('calls')
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  @Get()
  @RequirePermissions('call:read:own', 'call:read:all')
  @ApiOperation({ summary: "Qo'ng'iroqlar tarixi" })
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodQuery(callFiltersSchema)) query: z.infer<typeof callFiltersSchema>,
  ) {
    return this.calls.list(user, query);
  }

  @Get('active')
  @RequirePermissions('call:read:own', 'call:read:all')
  @ApiOperation({ summary: 'Hozir davom etayotgan suhbatlar' })
  active(@CurrentUser() user: AuthUser) {
    return this.calls.listActive(user);
  }

  @Get(':callId')
  @RequirePermissions('call:read:own', 'call:read:all')
  @ApiOperation({ summary: "Qo'ng'iroq tafsiloti (transkripsiya bilan)" })
  getOne(@CurrentUser() user: AuthUser, @Param('callId') callId: string) {
    return this.calls.getById(user, callId);
  }

  @Post('originate')
  @RequirePermissions('call:originate')
  @Audit('call.originate', 'call')
  @ApiOperation({ summary: "Click-to-call — operator va mijozni bog'lash" })
  originate(@CurrentUser() user: AuthUser, @Body() dto: OriginateDto) {
    return this.calls.originate(user, dto.to, dto.contactId, dto.operatorId);
  }

  @Post(':callId/answer')
  @HttpCode(204)
  @RequirePermissions('call:control')
  async answer(@CurrentUser() user: AuthUser, @Param('callId') callId: string): Promise<void> {
    await this.calls.control(user, callId, 'answer');
  }

  @Post(':callId/hangup')
  @HttpCode(204)
  @RequirePermissions('call:control')
  @Audit('call.hangup', 'call')
  async hangup(@CurrentUser() user: AuthUser, @Param('callId') callId: string): Promise<void> {
    await this.calls.control(user, callId, 'hangup');
  }

  @Post(':callId/hold')
  @HttpCode(204)
  @RequirePermissions('call:control')
  async hold(@CurrentUser() user: AuthUser, @Param('callId') callId: string): Promise<void> {
    await this.calls.control(user, callId, 'hold');
  }

  @Post(':callId/unhold')
  @HttpCode(204)
  @RequirePermissions('call:control')
  async unhold(@CurrentUser() user: AuthUser, @Param('callId') callId: string): Promise<void> {
    await this.calls.control(user, callId, 'unhold');
  }

  @Post(':callId/mute')
  @HttpCode(204)
  @RequirePermissions('call:control')
  async mute(@CurrentUser() user: AuthUser, @Param('callId') callId: string): Promise<void> {
    await this.calls.control(user, callId, 'mute');
  }

  @Post(':callId/unmute')
  @HttpCode(204)
  @RequirePermissions('call:control')
  async unmute(@CurrentUser() user: AuthUser, @Param('callId') callId: string): Promise<void> {
    await this.calls.control(user, callId, 'unmute');
  }

  @Post(':callId/transfer')
  @HttpCode(204)
  @RequirePermissions('call:control')
  @Audit('call.transfer', 'call')
  async transfer(
    @CurrentUser() user: AuthUser,
    @Param('callId') callId: string,
    @Body() dto: TransferDto,
  ): Promise<void> {
    await this.calls.transfer(user, callId, dto.target, dto.mode);
  }

  @Post(':callId/dtmf')
  @HttpCode(204)
  @RequirePermissions('call:control')
  async dtmf(
    @CurrentUser() user: AuthUser,
    @Param('callId') callId: string,
    @Body() dto: DtmfDto,
  ): Promise<void> {
    await this.calls.sendDtmf(user, callId, dto.digits);
  }

  @Post(':callId/spy')
  @HttpCode(204)
  @RequirePermissions('call:listen', 'call:whisper', 'call:barge')
  @Audit('call.spy', 'call')
  @ApiOperation({ summary: 'Supervisor: tinglash, pichirlash yoki suhbatga kirish' })
  async spy(
    @CurrentUser() user: AuthUser,
    @Param('callId') callId: string,
    @Body() dto: SpyDto,
  ): Promise<void> {
    await this.calls.spy(user, callId, dto.mode);
  }

  @Post(':callId/media-fork')
  @RequirePermissions('call:control')
  @ApiOperation({ summary: 'AI uchun audio oqimini yoqish' })
  startMediaFork(@CurrentUser() user: AuthUser, @Param('callId') callId: string) {
    return this.calls.startMediaFork(user, callId);
  }

  @Post(':callId/notes')
  @RequirePermissions('call:read:own', 'call:read:all')
  notes(@CurrentUser() user: AuthUser, @Param('callId') callId: string, @Body() dto: NoteDto) {
    return this.calls.addNote(user, callId, dto.notes);
  }
}
