import {Controller, Get, Post, Patch, Delete, Body, Query, Param, ParseUUIDPipe, Inject} from '@nestjs/common';
import {ApiOperation} from '@nestjs/swagger';
import type { User } from '@prisma/client';
import {CurrentUser, Protected, PageDto} from '../platform/common.js';
import {ChannelsService} from './channels.service.js';
import {MuteDto} from './channels.dto.js';
@Controller()
@Protected('channels', 'learner')
export class ChannelsController {
  constructor(
    @Inject(ChannelsService) private readonly service: ChannelsService,
  ) {}
  @Get('courses/:id/channel')
  @ApiOperation({ summary: 'GET courses/:id/channel' })
  course(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.course(user.id, id);
  }
  @Post('channels/:id/join')
  @ApiOperation({ summary: 'POST channels/:id/join' })
  join(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.join(user.id, id);
  }
  @Delete('channels/:id/join')
  @ApiOperation({ summary: 'DELETE channels/:id/join' })
  leave(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.leave(user.id, id);
  }
  @Patch('channels/:id/mute')
  @ApiOperation({ summary: 'PATCH channels/:id/mute' })
  mute(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MuteDto,
  ) {
    return this.service.mute(user.id, id, dto);
  }
  @Get('channels/:id/messages')
  @ApiOperation({ summary: 'GET channels/:id/messages' })
  messages(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PageDto,
  ) {
    return this.service.messages(user.id, id, q);
  }
}
