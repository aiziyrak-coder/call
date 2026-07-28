import { Controller, Delete, Get, Headers, HttpCode, Param, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RecordingsService } from './recordings.service';
import { Audit, CurrentUser, RequirePermissions } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';

@ApiTags('recordings')
@Controller('recordings')
export class RecordingsController {
  constructor(private readonly recordings: RecordingsService) {}

  /**
   * Cookie-auth oqim: `<audio src>` same-origin da httpOnly cookie yuboradi.
   * Query-string JWT yo'q — access log / Referer orqali token sizib chiqmaydi.
   */
  @Get(':callId/stream')
  @RequirePermissions('recording:read:own', 'recording:read:all')
  @ApiOperation({ summary: 'Yozuvni oqim sifatida berish (sessiya cookie)' })
  async stream(
    @CurrentUser() user: AuthUser,
    @Param('callId') callId: string,
    @Headers('range') range: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.recordings.openStreamForUser(user, callId, range);

    response.status(range ? 206 : 200);
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('Content-Length', String(result.contentLength));
    if (result.contentRange) response.setHeader('Content-Range', result.contentRange);
    response.setHeader('Cache-Control', 'private, no-store');

    result.stream.pipe(response);
  }

  @Get(':callId/url')
  @RequirePermissions('recording:read:own', 'recording:read:all')
  @Audit('recording.play', 'recording')
  @ApiOperation({ summary: 'Yozuvni tinglash uchun same-origin havola' })
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
