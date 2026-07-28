import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { SmsService } from './sms.service';
import {
  BulkSmsDto,
  SendSmsDto,
  TemplateWriteDto,
  smsListSchema,
  templateWriteSchema,
} from './sms.dto';
import { ZodQuery, createZodDto } from '../common/zod';
import { Audit, CurrentUser, RequirePermissions } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';

class TemplatePatchDto extends createZodDto(templateWriteSchema.partial()) {}

@ApiTags('sms')
@Controller('sms')
export class SmsController {
  constructor(private readonly sms: SmsService) {}

  @Get()
  @RequirePermissions('sms:read:own', 'sms:read:all')
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodQuery(smsListSchema)) query: z.infer<typeof smsListSchema>,
  ) {
    return this.sms.list(user, query);
  }

  @Get('providers')
  @RequirePermissions('sms:read:all')
  @ApiOperation({ summary: 'Provayderlar holati (android / shlyuz / eskiz)' })
  providers() {
    return this.sms.providerStatus();
  }

  @Post()
  @RequirePermissions('sms:send')
  @Audit('sms.send', 'sms')
  @ApiOperation({ summary: 'Bitta SMS yuborish' })
  send(@CurrentUser() user: AuthUser, @Body() body: SendSmsDto) {
    return this.sms.send(user, body);
  }

  @Post('bulk')
  @RequirePermissions('sms:bulk')
  @Audit('sms.bulk', 'sms')
  @ApiOperation({ summary: "Segment bo'yicha ommaviy yuborish" })
  bulk(@CurrentUser() user: AuthUser, @Body() body: BulkSmsDto) {
    return this.sms.sendBulk(user, body);
  }

  @Get('templates')
  @RequirePermissions('sms:read:own', 'sms:read:all')
  templates(@CurrentUser() user: AuthUser) {
    return this.sms.templates(user);
  }

  @Post('templates')
  @RequirePermissions('sms:bulk')
  createTemplate(@CurrentUser() user: AuthUser, @Body() body: TemplateWriteDto) {
    return this.sms.createTemplate(user, body);
  }

  @Patch('templates/:id')
  @RequirePermissions('sms:bulk')
  updateTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: TemplatePatchDto,
  ) {
    return this.sms.updateTemplate(user, id, body);
  }

  @Delete('templates/:id')
  @HttpCode(204)
  @RequirePermissions('sms:bulk')
  async removeTemplate(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.sms.removeTemplate(user, id);
  }
}
