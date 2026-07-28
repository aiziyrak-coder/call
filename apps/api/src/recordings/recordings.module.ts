import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RecordingsController } from './recordings.controller';
import { RecordingsService } from './recordings.service';
import { StorageService } from './storage.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [RecordingsController],
  providers: [RecordingsService, StorageService],
  exports: [RecordingsService, StorageService],
})
export class RecordingsModule {}
