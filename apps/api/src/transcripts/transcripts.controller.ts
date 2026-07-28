import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { createZodDto } from '../common/zod';
import { TranscriptsService } from './transcripts.service';
import { CurrentUser, RequirePermissions } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';

const searchSchema = z.object({
  q: z.string().trim().min(1).max(200),
});
class TranscriptSearchDto extends createZodDto(searchSchema) {}

@ApiTags('transcripts')
@Controller('transcripts')
export class TranscriptsController {
  constructor(private readonly transcripts: TranscriptsService) {}

  @Get('search')
  @RequirePermissions('call:read:own', 'call:read:all')
  @ApiOperation({ summary: "Suhbat matnlari bo'yicha qidiruv" })
  search(@CurrentUser() user: AuthUser, @Query() query: TranscriptSearchDto) {
    return this.transcripts.search(user, query.q);
  }

  @Get(':callId')
  @RequirePermissions('call:read:own', 'call:read:all')
  @ApiOperation({ summary: 'Suhbat transkripsiyasi va segmentlari' })
  async byCall(@CurrentUser() user: AuthUser, @Param('callId') callId: string) {
    const transcript = await this.transcripts.getByCall(user, callId);
    if (!transcript) throw new NotFoundException('Transkripsiya topilmadi');
    return transcript;
  }
}
