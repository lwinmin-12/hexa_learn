import {Controller, Get, Post, Patch, Delete, Body, Query, Param, ParseUUIDPipe, Inject} from '@nestjs/common';
import {ApiOperation} from '@nestjs/swagger';
import type { User } from '@prisma/client';
import {CurrentUser, Protected, PageDto} from '../platform/common.js';
import {AdminLearningToolsService} from './admin-learning-tools.service.js';
import {FlashcardDto, UpdateFlashcardDto, AudioDto, UpdateAudioDto} from './admin-learning-tools.dto.js';
import {UseInterceptors, UploadedFile} from '@nestjs/common';
import {FileInterceptor} from '@nestjs/platform-express';
import {ApiConsumes, ApiBody} from '@nestjs/swagger';
@Controller()
@Protected('admin-learning-tools', 'super_admin', 'page_admin')
export class AdminLearningToolsController {
  constructor(
    @Inject(AdminLearningToolsService)
    private readonly service: AdminLearningToolsService,
  ) {}
  @Get('admin/chapters/:id/flashcards')
  @ApiOperation({ summary: 'GET admin/chapters/:id/flashcards' })
  flashcards(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PageDto,
  ) {
    return this.service.flashcards(user, id, q);
  }
  @Post('admin/chapters/:id/flashcards')
  @ApiOperation({ summary: 'POST admin/chapters/:id/flashcards' })
  createFlashcard(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FlashcardDto,
  ) {
    return this.service.createFlashcard(user, id, dto);
  }
  @Patch('admin/flashcards/:id')
  @ApiOperation({ summary: 'PATCH admin/flashcards/:id' })
  updateFlashcard(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFlashcardDto,
  ) {
    return this.service.updateFlashcard(user, id, dto);
  }
  @Delete('admin/flashcards/:id')
  @ApiOperation({ summary: 'DELETE admin/flashcards/:id' })
  deleteFlashcard(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteFlashcard(user, id);
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
  @Post('admin/chapters/:id/flashcards/import')
  @ApiOperation({ summary: 'POST admin/chapters/:id/flashcards/import' })
  import(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.import(user, id, file);
  }
  @Get('admin/chapters/:id/audio')
  @ApiOperation({ summary: 'GET admin/chapters/:id/audio' })
  audio(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PageDto,
  ) {
    return this.service.audio(user, id, q);
  }
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 30 * 1024 * 1024 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({schema:{type:'object',required:['file','title','type'],properties:{file:{type:'string',format:'binary'},title:{type:'string'},type:{type:'string',enum:['vocab','speaking']},durationSec:{type:'integer',minimum:1},position:{type:'integer',minimum:0}}}})
  @Post('admin/chapters/:id/audio')
  @ApiOperation({ summary: 'POST admin/chapters/:id/audio' })
  createAudio(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AudioDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.createAudio(user, id, dto, file);
  }
  @Patch('admin/audio/:id')
  @ApiOperation({ summary: 'PATCH admin/audio/:id' })
  updateAudio(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAudioDto,
  ) {
    return this.service.updateAudio(user, id, dto);
  }
  @Delete('admin/audio/:id')
  @ApiOperation({ summary: 'DELETE admin/audio/:id' })
  deleteAudio(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteAudio(user, id);
  }
}
