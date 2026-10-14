import {Controller, Get, Post, Patch, Delete, Body, Query, Param, ParseUUIDPipe, Inject} from '@nestjs/common';
import {ApiOperation} from '@nestjs/swagger';
import type { User } from '@prisma/client';
import {CurrentUser, Protected, PageDto} from '../platform/common.js';
import {AdminChannelsService} from './admin-channels.service.js';
import {ChannelDto, MessageDto} from '../channels/channels.dto.js';
@Controller()
@Protected('admin-channels', 'super_admin', 'page_admin')
export class AdminChannelsController {
  constructor(
    @Inject(AdminChannelsService)
    private readonly service: AdminChannelsService,
  ) {}
  @Get('admin/courses/:id/channel')
  @ApiOperation({ summary: 'GET admin/courses/:id/channel' })
  course(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.course(user, id);
  }
  @Patch('admin/channels/:id')
  @ApiOperation({ summary: 'PATCH admin/channels/:id' })
  update(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChannelDto,
  ) {
    return this.service.update(user, id, dto);
  }
  @Get('admin/channels/:id/members')
  @ApiOperation({ summary: 'GET admin/channels/:id/members' })
  members(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PageDto,
  ) {
    return this.service.members(user, id, q);
  }
  @Delete('admin/channels/:id/members/:userId')
  @ApiOperation({ summary: 'DELETE admin/channels/:id/members/:userId' })
  remove(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.service.remove(user, id, userId);
  }
  @Post('admin/channels/:id/messages')
  @ApiOperation({ summary: 'POST admin/channels/:id/messages' })
  send(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MessageDto,
  ) {
    return this.service.send(user, id, dto);
  }
  @Get('admin/channels/:id/messages')
  @ApiOperation({ summary: 'GET admin/channels/:id/messages' })
  messages(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PageDto,
  ) {
    return this.service.messages(user, id, q);
  }
  @Delete('admin/messages/:id')
  @ApiOperation({ summary: 'DELETE admin/messages/:id' })
  delete(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.delete(user, id);
  }
}
