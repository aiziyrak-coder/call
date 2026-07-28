import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';
import { CallProjectionService } from './call-projection.service';
import { TelephonyClient } from '../telephony/telephony-client.service';
import { EventConsumer } from '../events/event-consumer.service';
import { UsersController } from '../users/users.controller';
import { UsersService } from '../users/users.service';
import { RecordingsModule } from '../recordings/recordings.module';
import { TranscriptsModule } from '../transcripts/transcripts.module';

/**
 * Telefoniya, real-time va foydalanuvchi holati bir-biriga chambarchas bog'liq
 * (hodisa -> proyeksiya -> socket), shuning uchun bitta modulda saqlanadi.
 */
@Module({
  imports: [JwtModule.register({}), RecordingsModule, TranscriptsModule],
  controllers: [CallsController, UsersController],
  providers: [CallsService, CallProjectionService, TelephonyClient, EventConsumer, UsersService],
  exports: [CallProjectionService, TelephonyClient, CallsService],
})
export class CallsModule {}
