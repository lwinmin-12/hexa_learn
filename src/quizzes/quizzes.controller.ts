import {Controller, Get, Post, Body, Query, Param, ParseUUIDPipe, Inject} from '@nestjs/common';
import {ApiOperation} from '@nestjs/swagger';
import type { User } from '@prisma/client';
import {CurrentUser, Protected, PageDto} from '../platform/common.js';
import {QuizzesService} from './quizzes.service.js';
import {SubmitDto} from './quizzes.dto.js';
@Controller()
@Protected('quizzes', 'learner')
export class QuizzesController {
  constructor(
    @Inject(QuizzesService) private readonly service: QuizzesService,
  ) {}
  @Get('courses/:id/quizzes')
  @ApiOperation({ summary: 'GET courses/:id/quizzes' })
  list(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PageDto,
  ) {
    return this.service.list(user.id, 'courseId', id, q);
  }
  @Get('chapters/:id/quizzes')
  @ApiOperation({ summary: 'GET chapters/:id/quizzes' })
  list1(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PageDto,
  ) {
    return this.service.list(user.id, 'chapterId', id, q);
  }
  @Get('episodes/:id/quizzes')
  @ApiOperation({ summary: 'GET episodes/:id/quizzes' })
  list2(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PageDto,
  ) {
    return this.service.list(user.id, 'episodeId', id, q);
  }
  @Get('quizzes/:id')
  @ApiOperation({ summary: 'GET quizzes/:id' })
  detail(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(user.id, id);
  }
  @Post('quizzes/:id/attempts')
  @ApiOperation({ summary: 'POST quizzes/:id/attempts' })
  start(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.start(user.id, id);
  }
  @Post('quiz-attempts/:id/submit')
  @ApiOperation({ summary: 'POST quiz-attempts/:id/submit' })
  submit(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitDto,
  ) {
    return this.service.submit(user.id, id, dto);
  }
  @Get('quiz-attempts/:id')
  @ApiOperation({ summary: 'GET quiz-attempts/:id' })
  review(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.review(user.id, id);
  }
  @Get('quizzes/:id/attempts')
  @ApiOperation({ summary: 'GET quizzes/:id/attempts' })
  history(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PageDto,
  ) {
    return this.service.history(user.id, id, q);
  }
}
