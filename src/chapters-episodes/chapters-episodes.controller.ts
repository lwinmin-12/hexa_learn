import {Controller, Get, Query, Param, ParseUUIDPipe, Inject} from '@nestjs/common';
import {ApiOperation} from '@nestjs/swagger';
import type { User } from '@prisma/client';
import {CurrentUser, Protected, PageDto} from '../platform/common.js';
import {ChaptersEpisodesService} from './chapters-episodes.service.js';

@Controller()
@Protected('chapters-episodes', 'learner')
export class ChaptersEpisodesController {
  constructor(
    @Inject(ChaptersEpisodesService)
    private readonly service: ChaptersEpisodesService,
  ) {}
  @Get('courses/:id/chapters')
  @ApiOperation({ summary: 'GET courses/:id/chapters' })
  chapters(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Query() q:PageDto) {
    return this.service.chapters(user.id, id,q);
  }
  @Get('chapters/:id')
  @ApiOperation({ summary: 'GET chapters/:id' })
  chapter(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.chapter(user.id, id);
  }
  @Get('episodes/:id')
  @ApiOperation({ summary: 'GET episodes/:id' })
  episode(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.episode(user.id, id);
  }
}
