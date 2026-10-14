import {Controller, Get, Post, Patch, Query, Param, ParseUUIDPipe, Inject} from '@nestjs/common';
import {ApiOperation} from '@nestjs/swagger';
import type { User } from '@prisma/client';
import {CurrentUser, Protected} from '../platform/common.js';
import {NotificationsService} from './notifications.service.js';
import {NotificationQuery} from '../channels/channels.dto.js';
@Controller()
@Protected('notifications', 'learner')
export class NotificationsController {
  constructor(
    @Inject(NotificationsService)
    private readonly service: NotificationsService,
  ) {}
  @Get('me/notifications')
  @ApiOperation({ summary: 'GET me/notifications' })
  list(@CurrentUser() user: User, @Query() q: NotificationQuery) {
    return this.service.list(user.id, q);
  }
  @Get('me/notifications/unread-count')
  @ApiOperation({ summary: 'GET me/notifications/unread-count' })
  count(@CurrentUser() user: User) {
    return this.service.count(user.id);
  }
  @Patch('me/notifications/:id/read')
  @ApiOperation({ summary: 'PATCH me/notifications/:id/read' })
  read(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.read(user.id, id);
  }
  @Post('me/notifications/read-all')
  @ApiOperation({ summary: 'POST me/notifications/read-all' })
  all(@CurrentUser() user: User) {
    return this.service.all(user.id);
  }
}
