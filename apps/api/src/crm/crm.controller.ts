import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { ContactsService } from './contacts.service';
import { DealsService } from './deals.service';
import { TasksService } from './tasks.service';
import {
  ContactWriteDto,
  DealMoveDto,
  DealWriteDto,
  ImportContactsDto,
  MergeContactsDto,
  TaskWriteDto,
  contactListSchema,
  contactWriteSchema,
  dealWriteSchema,
  lookupSchema,
  taskListSchema,
  taskWriteSchema,
  timelineSchema,
} from './crm.dto';
import { ZodQuery, createZodDto } from '../common/zod';
import { Audit, CurrentUser, RequirePermissions } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';

class NoteDto extends createZodDto(z.object({ body: z.string().min(1).max(4000) })) {}
class ContactPatchDto extends createZodDto(contactWriteSchema.partial()) {}
class DealPatchDto extends createZodDto(dealWriteSchema.partial()) {}
class TaskPatchDto extends createZodDto(taskWriteSchema.partial()) {}

@ApiTags('crm')
@Controller()
export class CrmController {
  constructor(
    private readonly contacts: ContactsService,
    private readonly deals: DealsService,
    private readonly tasks: TasksService,
  ) {}

  // --------------------------------------------------------------- kontaktlar

  @Get('contacts')
  @RequirePermissions('contact:read:own', 'contact:read:all')
  @ApiOperation({ summary: "Kontaktlar ro'yxati (qidiruv, teg, egasi bo'yicha)" })
  listContacts(
    @CurrentUser() user: AuthUser,
    @Query(new ZodQuery(contactListSchema)) query: z.infer<typeof contactListSchema>,
  ) {
    return this.contacts.list(user, query);
  }

  /**
   * Kiruvchi qo'ng'iroq kelganda brauzer shu endpointdan kartochkani oladi
   * (screen-pop). Marshrut `:id` dan oldin turishi shart.
   */
  @Get('contacts/lookup')
  @RequirePermissions('contact:read:own', 'contact:read:all')
  @ApiOperation({ summary: "Raqam bo'yicha kontaktni topish (screen-pop)" })
  lookup(
    @CurrentUser() user: AuthUser,
    @Query(new ZodQuery(lookupSchema)) query: z.infer<typeof lookupSchema>,
  ) {
    return this.contacts.lookupByPhone(user, query.phone);
  }

  @Get('contacts/duplicates')
  @RequirePermissions('contact:read:all')
  @ApiOperation({ summary: 'Bir xil raqamli kartochkalar guruhlari' })
  duplicates(@CurrentUser() user: AuthUser) {
    return this.contacts.duplicates(user);
  }

  @Get('contacts/export')
  @RequirePermissions('contact:read:all')
  @Audit('contact.export', 'contact')
  @ApiOperation({ summary: 'Kontaktlarni CSV ga eksport qilish' })
  async exportContacts(@CurrentUser() user: AuthUser, @Res() response: Response): Promise<void> {
    const csv = await this.contacts.exportCsv(user);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="aicc-contacts.csv"');
    response.send(csv);
  }

  @Post('contacts/import')
  @RequirePermissions('contact:import')
  @Audit('contact.import', 'contact')
  @ApiOperation({ summary: 'CSV dan kontaktlarni import qilish' })
  importContacts(@CurrentUser() user: AuthUser, @Body() body: ImportContactsDto) {
    return this.contacts.importCsv(user, body);
  }

  @Post('contacts/merge')
  @RequirePermissions('contact:write')
  @Audit('contact.merge', 'contact')
  @ApiOperation({ summary: 'Ikki kartochkani birlashtirish' })
  merge(@CurrentUser() user: AuthUser, @Body() body: MergeContactsDto) {
    return this.contacts.merge(user, body.sourceId, body.targetId);
  }

  @Get('contacts/:id')
  @RequirePermissions('contact:read:own', 'contact:read:all')
  getContact(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.contacts.get(user, id);
  }

  @Get('contacts/:id/timeline')
  @RequirePermissions('contact:read:own', 'contact:read:all')
  @ApiOperation({ summary: "Qo'ng'iroq, SMS va izohlardan iborat yagona lenta" })
  timeline(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query(new ZodQuery(timelineSchema)) query: z.infer<typeof timelineSchema>,
  ) {
    return this.contacts.timeline(user, id, query);
  }

  @Post('contacts')
  @RequirePermissions('contact:write')
  @Audit('contact.create', 'contact')
  createContact(@CurrentUser() user: AuthUser, @Body() body: ContactWriteDto) {
    return this.contacts.create(user, body);
  }

  @Patch('contacts/:id')
  @RequirePermissions('contact:write')
  @Audit('contact.update', 'contact')
  updateContact(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: ContactPatchDto,
  ) {
    return this.contacts.update(user, id, body);
  }

  @Post('contacts/:id/notes')
  @RequirePermissions('contact:write')
  addNote(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: NoteDto) {
    return this.contacts.addNote(user, id, body.body);
  }

  @Delete('contacts/:id')
  @HttpCode(204)
  @RequirePermissions('contact:delete')
  @Audit('contact.delete', 'contact')
  async removeContact(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.contacts.remove(user, id);
  }

  // ------------------------------------------------------------------ voronka

  @Get('pipelines')
  @RequirePermissions('deal:read:own', 'deal:read:all')
  pipelines(@CurrentUser() user: AuthUser) {
    return this.deals.pipelines(user);
  }

  @Get('deals/board')
  @RequirePermissions('deal:read:own', 'deal:read:all')
  @ApiOperation({ summary: "Voronka ko'rinishi: bosqichlar va ulardagi bitimlar" })
  board(@CurrentUser() user: AuthUser, @Query('pipelineId') pipelineId?: string) {
    return this.deals.board(user, pipelineId);
  }

  @Post('deals')
  @RequirePermissions('deal:write')
  @Audit('deal.create', 'deal')
  createDeal(@CurrentUser() user: AuthUser, @Body() body: DealWriteDto) {
    return this.deals.create(user, body);
  }

  @Patch('deals/:id')
  @RequirePermissions('deal:write')
  @Audit('deal.update', 'deal')
  updateDeal(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: DealPatchDto) {
    return this.deals.update(user, id, body);
  }

  @Post('deals/:id/move')
  @RequirePermissions('deal:write')
  @ApiOperation({ summary: "Bitimni boshqa bosqichga/o'ringa ko'chirish (drag-and-drop)" })
  moveDeal(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: DealMoveDto) {
    return this.deals.move(user, id, body);
  }

  @Delete('deals/:id')
  @HttpCode(204)
  @RequirePermissions('deal:write')
  @Audit('deal.delete', 'deal')
  async removeDeal(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.deals.remove(user, id);
  }

  // ----------------------------------------------------------------- vazifalar

  @Get('tasks')
  @RequirePermissions('task:read:own', 'task:read:all')
  listTasks(
    @CurrentUser() user: AuthUser,
    @Query(new ZodQuery(taskListSchema)) query: z.infer<typeof taskListSchema>,
  ) {
    return this.tasks.list(user, query);
  }

  @Post('tasks')
  @RequirePermissions('task:write')
  createTask(@CurrentUser() user: AuthUser, @Body() body: TaskWriteDto) {
    return this.tasks.create(user, body);
  }

  @Patch('tasks/:id')
  @RequirePermissions('task:write')
  updateTask(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: TaskPatchDto) {
    return this.tasks.update(user, id, body);
  }

  @Delete('tasks/:id')
  @HttpCode(204)
  @RequirePermissions('task:write')
  async removeTask(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.tasks.remove(user, id);
  }
}
