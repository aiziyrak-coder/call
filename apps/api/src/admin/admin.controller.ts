import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { AdminService } from './admin.service';
import { AnalyticsService } from './analytics.service';
import {
  QueueWriteDto,
  UserCreateDto,
  UserUpdateDto,
  TenantSettingsDto,
  CampaignCreateDto,
  analyticsRangeSchema,
  auditListSchema,
  queueWriteSchema,
  userListSchema,
} from './admin.dto';
import { ZodQuery, createZodDto } from '../common/zod';
import { Audit, CurrentUser, RequirePermissions } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';

class QueuePatchDto extends createZodDto(queueWriteSchema.partial()) {}

@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly analytics: AnalyticsService,
  ) {}

  // -------------------------------------------------------- foydalanuvchilar

  @Get('users')
  @RequirePermissions('user:read')
  listUsers(
    @CurrentUser() user: AuthUser,
    @Query(new ZodQuery(userListSchema)) query: z.infer<typeof userListSchema>,
  ) {
    return this.admin.listUsers(user, query);
  }

  @Post('users')
  @RequirePermissions('user:write')
  @Audit('user.create', 'user')
  createUser(@CurrentUser() user: AuthUser, @Body() body: UserCreateDto) {
    return this.admin.createUser(user, body);
  }

  @Patch('users/:id')
  @RequirePermissions('user:write')
  @Audit('user.update', 'user')
  updateUser(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: UserUpdateDto) {
    return this.admin.updateUser(user, id, body);
  }

  @Post('users/:id/revoke-sessions')
  @RequirePermissions('user:write')
  @Audit('user.revoke_sessions', 'user')
  @ApiOperation({ summary: 'Barcha sessiyalarni bekor qilish' })
  revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.revokeSessions(user, id);
  }

  // ---------------------------------------------------------------- navbatlar

  @Get('queues')
  @RequirePermissions('queue:manage')
  listQueues(@CurrentUser() user: AuthUser) {
    return this.admin.listQueues(user);
  }

  @Post('queues')
  @RequirePermissions('queue:manage')
  @Audit('queue.create', 'queue')
  createQueue(@CurrentUser() user: AuthUser, @Body() body: QueueWriteDto) {
    return this.admin.createQueue(user, body);
  }

  @Patch('queues/:id')
  @RequirePermissions('queue:manage')
  @Audit('queue.update', 'queue')
  updateQueue(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: QueuePatchDto) {
    return this.admin.updateQueue(user, id, body);
  }

  @Delete('queues/:id')
  @HttpCode(204)
  @RequirePermissions('queue:manage')
  @Audit('queue.delete', 'queue')
  async removeQueue(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.admin.removeQueue(user, id);
  }

  // -------------------------------------------------------------- audit-jurnal

  @Get('audit')
  @RequirePermissions('audit:read')
  audit(
    @CurrentUser() user: AuthUser,
    @Query(new ZodQuery(auditListSchema)) query: z.infer<typeof auditListSchema>,
  ) {
    return this.admin.listAudit(user, query);
  }

  // ----------------------------------------------------------------- analitika

  @Get('analytics/realtime')
  @RequirePermissions('analytics:read:all', 'analytics:read:own')
  @ApiOperation({ summary: "Jonli holat: faol qo'ng'iroqlar, navbat, qurilmalar" })
  realtime(@CurrentUser() user: AuthUser) {
    return this.analytics.realtime(user);
  }

  @Get('analytics/summary')
  @RequirePermissions('analytics:read:all', 'analytics:read:own')
  @ApiOperation({ summary: "KPI: AHT, SLA, o'tkazib yuborilgan qo'ng'iroqlar" })
  summary(
    @CurrentUser() user: AuthUser,
    @Query(new ZodQuery(analyticsRangeSchema)) query: z.infer<typeof analyticsRangeSchema>,
  ) {
    return this.analytics.summary(user, query);
  }

  @Get('analytics/operators')
  @RequirePermissions('analytics:read:all')
  @ApiOperation({ summary: 'Operatorlar reytingi' })
  operators(
    @CurrentUser() user: AuthUser,
    @Query(new ZodQuery(analyticsRangeSchema)) query: z.infer<typeof analyticsRangeSchema>,
  ) {
    return this.analytics.operators(user, query);
  }

  @Get('analytics/hourly')
  @RequirePermissions('analytics:read:all', 'analytics:read:own')
  @ApiOperation({ summary: 'Soatlik yuklama taqsimoti' })
  hourly(
    @CurrentUser() user: AuthUser,
    @Query(new ZodQuery(analyticsRangeSchema)) query: z.infer<typeof analyticsRangeSchema>,
  ) {
    return this.analytics.hourly(user, query);
  }

  // ----------------------------------------------------------- biznes / AI

  @Get('tenant-settings')
  @RequirePermissions('tenant:manage', 'knowledge:manage', 'call:read:own')
  @ApiOperation({ summary: 'Biznes profili va narxlar (AI uchun)' })
  getTenantSettings(@CurrentUser() user: AuthUser) {
    return this.admin.getTenantSettings(user);
  }

  @Patch('tenant-settings')
  @RequirePermissions('tenant:manage', 'knowledge:manage')
  @Audit('tenant.settings', 'tenant')
  updateTenantSettings(@CurrentUser() user: AuthUser, @Body() body: TenantSettingsDto) {
    return this.admin.updateTenantSettings(user, body);
  }

  @Get('campaigns')
  @RequirePermissions('call:originate')
  listCampaigns(@CurrentUser() user: AuthUser) {
    return this.admin.listCampaigns(user);
  }

  @Post('campaigns')
  @RequirePermissions('call:originate')
  @Audit('campaign.create', 'campaign')
  createCampaign(@CurrentUser() user: AuthUser, @Body() body: CampaignCreateDto) {
    return this.admin.createCampaign(user, body);
  }

  @Post('campaigns/:id/start')
  @RequirePermissions('call:originate')
  @Audit('campaign.start', 'campaign')
  startCampaign(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.startCampaign(user, id);
  }

  @Post('campaigns/:id/pause')
  @RequirePermissions('call:originate')
  @Audit('campaign.pause', 'campaign')
  pauseCampaign(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.admin.pauseCampaign(user, id);
  }
}
