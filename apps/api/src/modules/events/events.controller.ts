import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { EventsService } from './events.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  async listEvents(
    @CurrentUser('id') userId: string,
    @Query('status') status?: string,
  ) {
    const events = await this.eventsService.listEvents(userId, status);
    return { events };
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approveEvent(
    @CurrentUser('id') userId: string,
    @Param('id') eventId: string,
  ) {
    const event = await this.eventsService.approveEvent(userId, eventId);
    return { event, message: 'Event approved' };
  }

  @Post(':id/ignore')
  @HttpCode(HttpStatus.OK)
  async ignoreEvent(
    @CurrentUser('id') userId: string,
    @Param('id') eventId: string,
  ) {
    const event = await this.eventsService.ignoreEvent(userId, eventId);
    return { event, message: 'Event dismissed' };
  }

  @Post(':id/undo')
  @HttpCode(HttpStatus.OK)
  async undoEvent(
    @CurrentUser('id') userId: string,
    @Param('id') eventId: string,
  ) {
    const event = await this.eventsService.undoEvent(userId, eventId);
    return { event, message: 'Approval undone, event returned to pending' };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteEvent(
    @CurrentUser('id') userId: string,
    @Param('id') eventId: string,
  ) {
    return this.eventsService.deleteEvent(userId, eventId);
  }
}
