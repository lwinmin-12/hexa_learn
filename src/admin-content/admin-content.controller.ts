import {Controller, Get, Post, Put, Patch, Delete, Body, Query, Param, ParseUUIDPipe, Inject} from '@nestjs/common';
import {ApiOperation} from '@nestjs/swagger';
import type { User } from '@prisma/client';
import {CurrentUser, Protected} from '../platform/common.js';
import {AdminContentService} from './admin-content.service.js';
import {AdminCourseQuery, CourseDto, UpdateCourseDto, ChapterDto, UpdateChapterDto, EpisodeDto, UpdateEpisodeDto, ReorderDto, UploadVideoDto, ConfirmVideoDto} from './admin-content.dto.js';
import {UseInterceptors, UploadedFile} from '@nestjs/common';
import {FileInterceptor} from '@nestjs/platform-express';
import {ApiConsumes, ApiBody} from '@nestjs/swagger';
@Controller()
@Protected('admin-content', 'super_admin', 'page_admin')
export class AdminContentController {
  constructor(
    @Inject(AdminContentService) private readonly service: AdminContentService,
  ) {}
  @Get('admin/courses')
  @ApiOperation({ summary: 'GET admin/courses' })
  list(@CurrentUser() user: User, @Query() q: AdminCourseQuery) {
    return this.service.list(user, q);
  }
  @Post('admin/courses')
  @ApiOperation({ summary: 'POST admin/courses' })
  create(@CurrentUser() user: User, @Body() dto: CourseDto) {
    return this.service.create(user, dto);
  }
  @Get('admin/courses/:id')
  @ApiOperation({ summary: 'GET admin/courses/:id' })
  detail(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(user, id);
  }
  @Patch('admin/courses/:id')
  @ApiOperation({ summary: 'PATCH admin/courses/:id' })
  update(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCourseDto,
  ) {
    return this.service.update(user, id, dto);
  }
  @Delete('admin/courses/:id')
  @ApiOperation({ summary: 'DELETE admin/courses/:id' })
  delete(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.delete(user, 'course', id);
  }
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @Post('admin/courses/:id/cover')
  @ApiOperation({ summary: 'POST admin/courses/:id/cover' })
  cover(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.cover(user, id, file);
  }
  @Post('admin/courses/:id/chapters')
  @ApiOperation({ summary: 'POST admin/courses/:id/chapters' })
  chapter(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChapterDto,
  ) {
    return this.service.chapter(user, id, dto);
  }
  @Patch('admin/chapters/:id')
  @ApiOperation({ summary: 'PATCH admin/chapters/:id' })
  updateChapter(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateChapterDto,
  ) {
    return this.service.updateChapter(user, id, dto);
  }
  @Delete('admin/chapters/:id')
  @ApiOperation({ summary: 'DELETE admin/chapters/:id' })
  delete8(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.delete(user, 'chapter', id);
  }
  @Put('admin/courses/:id/chapters/reorder')
  @ApiOperation({ summary: 'PUT admin/courses/:id/chapters/reorder' })
  reorder(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderDto,
  ) {
    return this.service.reorder(user, 'chapter', id, dto);
  }
  @Post('admin/chapters/:id/episodes')
  @ApiOperation({ summary: 'POST admin/chapters/:id/episodes' })
  episode(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EpisodeDto,
  ) {
    return this.service.episode(user, id, dto);
  }
  @Patch('admin/episodes/:id')
  @ApiOperation({ summary: 'PATCH admin/episodes/:id' })
  updateEpisode(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEpisodeDto,
  ) {
    return this.service.updateEpisode(user, id, dto);
  }
  @Delete('admin/episodes/:id')
  @ApiOperation({ summary: 'DELETE admin/episodes/:id' })
  delete12(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.delete(user, 'episode', id);
  }
  @Put('admin/chapters/:id/episodes/reorder')
  @ApiOperation({ summary: 'PUT admin/chapters/:id/episodes/reorder' })
  reorder13(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderDto,
  ) {
    return this.service.reorder(user, 'episode', id, dto);
  }
  @Post('admin/episodes/:id/video/upload-url')
  @ApiOperation({ summary: 'POST admin/episodes/:id/video/upload-url' })
  uploadUrl(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UploadVideoDto,
  ) {
    return this.service.uploadUrl(user, id, dto);
  }
  @Post('admin/episodes/:id/video')
  @ApiOperation({ summary: 'POST admin/episodes/:id/video' })
  confirm(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmVideoDto,
  ) {
    return this.service.confirm(user, id, dto);
  }
  @Delete('admin/episodes/:id/video')
  @ApiOperation({ summary: 'DELETE admin/episodes/:id/video' })
  removeVideo(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeVideo(user, id);
  }
}
