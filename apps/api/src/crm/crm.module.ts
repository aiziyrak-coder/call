import { Module } from '@nestjs/common';
import { CrmController } from './crm.controller';
import { ContactsService } from './contacts.service';
import { DealsService } from './deals.service';
import { TasksService } from './tasks.service';

@Module({
  controllers: [CrmController],
  providers: [ContactsService, DealsService, TasksService],
  exports: [ContactsService],
})
export class CrmModule {}
