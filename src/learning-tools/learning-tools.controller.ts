import {Controller, Get, Query, Param, ParseUUIDPipe, Inject} from '@nestjs/common';
import {ApiOperation} from '@nestjs/swagger';
import type { User } from '@prisma/client';
import {CurrentUser, Protected, PageDto} from '../platform/common.js';
import {LearningToolsService} from './learning-tools.service.js';
import {AudioQuery} from './learning-tools.dto.js';
@Controller()
@Protected('learning-tools', 'learner')
export class LearningToolsController {
  constructor(
    @Inject(LearningToolsService)
    private readonly service: LearningToolsService,
  ) {}
  @Get('chapters/:id/flashcards')
  @ApiOperation({ summary: 'GET chapters/:id/flashcards' })
  flashcards(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PageDto,
  ) {
    return this.service.flashcards(user.id, id, q);
  }
  @Get('chapters/:id/audio')
  @ApiOperation({ summary: 'GET chapters/:id/audio' })
  audio(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: AudioQuery,
  ) {
    return this.service.audio(user.id, id, q);
  }
}
