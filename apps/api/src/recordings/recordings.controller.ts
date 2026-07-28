import { Controller, Delete, Get, Headers, HttpCode, Param, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RecordingsService } from './recordings.service';
import { Audit, CurrentUser, Public, RequirePermissions } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';

@ApiTags('recordings')
@Controller('recordings')
export class RecordingsController {
  constructor(private readonly recordings: RecordingsService) {}

  /**
   * Oqim endpointi ataylab ochiq: brauzerdagi `<audio>` elementi `Authorization`
   * sarlavhasini yubora olmaydi. Huquq tekshiruvi imzolangan, 5 daqiqa amal
   * qiladigan token orqali bajariladi.
   */
  @Public()
  @Get('stream')
  @ApiOperation({ summary: 'Yozuvni oqim sifatida berish (imzolangan token bilan)' })
  async stream(
    @Query('token') token: string,
    @Headers('range') range: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.recordings.openStream(token, range);

    response.status(range ? 206 : 200);
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('Content-Length', String(result.contentLength));
    if (result.contentRange) response.setHeader('Content-Range', result.contentRange);
    // Yozuv shaxsiy ma'lumot — oraliq keshlarda qolmasligi kerak.
    response.setHeader('Cache-Control', 'private, no-store');

    result.stream.pipe(response);
  }

  @Get(':callId/url')
  @RequirePermissions('recording:read:own', 'recording:read:all')
  @Audit('recording.play', 'recording')
  @ApiOperation({ summary: 'Yozuvni tinglash uchun qisqa muddatli havola' })
  url(@CurrentUser() user: AuthUser, @Param('callId') callId: string) {
    return this.recordings.playbackUrl(user, callId);
  }

  @Delete(':callId')
  @HttpCode(204)
  @RequirePermissions('recording:delete')
  @Audit('recording.delete', 'recording')
  async remove(@CurrentUser() user: AuthUser, @Param('callId') callId: string): Promise<void> {
    await this.recordings.remove(user, callId);
  }
}
