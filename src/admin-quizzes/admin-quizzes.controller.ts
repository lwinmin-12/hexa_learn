import {Controller, Get, Post, Put, Patch, Delete, Body, Query, Param, ParseUUIDPipe, Inject} from '@nestjs/common';
import {ApiOperation} from '@nestjs/swagger';
import type { User } from '@prisma/client';
import {CurrentUser, Protected, PageDto} from '../platform/common.js';
import {AdminQuizzesService} from './admin-quizzes.service.js';
import {QuizDto, UpdateQuizDto, QuestionDto, UpdateQuestionDto, OptionDto, UpdateOptionDto} from './admin-quizzes.dto.js';
import {ReorderDto} from '../admin-content/admin-content.dto.js';
@Controller()
@Protected('admin-quizzes', 'super_admin', 'page_admin')
export class AdminQuizzesController {
  constructor(
    @Inject(AdminQuizzesService) private readonly service: AdminQuizzesService,
  ) {}
  @Post('admin/quizzes')
  @ApiOperation({ summary: 'POST admin/quizzes' })
  create(@CurrentUser() user: User, @Body() dto: QuizDto) {
    return this.service.create(user, dto);
  }
  @Get('admin/quizzes/:id')
  @ApiOperation({ summary: 'GET admin/quizzes/:id' })
  detail(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(user, id);
  }
  @Patch('admin/quizzes/:id')
  @ApiOperation({ summary: 'PATCH admin/quizzes/:id' })
  update(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuizDto,
  ) {
    return this.service.update(user, id, dto);
  }
  @Delete('admin/quizzes/:id')
  @ApiOperation({ summary: 'DELETE admin/quizzes/:id' })
  delete(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.delete(user, id);
  }
  @Post('admin/quizzes/:id/questions')
  @ApiOperation({ summary: 'POST admin/quizzes/:id/questions' })
  question(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: QuestionDto,
  ) {
    return this.service.question(user, id, dto);
  }
  @Patch('admin/questions/:id')
  @ApiOperation({ summary: 'PATCH admin/questions/:id' })
  updateQuestion(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.service.updateQuestion(user, id, dto);
  }
  @Delete('admin/questions/:id')
  @ApiOperation({ summary: 'DELETE admin/questions/:id' })
  deleteQuestion(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteQuestion(user, id);
  }
  @Put('admin/quizzes/:id/questions/reorder')
  @ApiOperation({ summary: 'PUT admin/quizzes/:id/questions/reorder' })
  reorder(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderDto,
  ) {
    return this.service.reorder(user, id, dto);
  }
  @Post('admin/questions/:id/options')
  @ApiOperation({ summary: 'POST admin/questions/:id/options' })
  option(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OptionDto,
  ) {
    return this.service.option(user, id, dto);
  }
  @Patch('admin/options/:id')
  @ApiOperation({ summary: 'PATCH admin/options/:id' })
  updateOption(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOptionDto,
  ) {
    return this.service.updateOption(user, id, dto);
  }
  @Delete('admin/options/:id')
  @ApiOperation({ summary: 'DELETE admin/options/:id' })
  deleteOption(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteOption(user, id);
  }
  @Get('admin/quizzes/:id/attempts')
  @ApiOperation({ summary: 'GET admin/quizzes/:id/attempts' })
  attempts(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PageDto,
  ) {
    return this.service.attempts(user, id, q);
  }
}
