import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AnalyticsService } from './analytics.service';
import { AuthModule } from '../auth/auth.module';
import { CallsModule } from '../calls/calls.module';

@Module({
  imports: [AuthModule, CallsModule],
  controllers: [AdminController],
  providers: [AdminService, AnalyticsService],
  exports: [AnalyticsService],
})
export class AdminModule {}
