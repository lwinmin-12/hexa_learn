import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiOperation } from '@nestjs/swagger';
import type { User } from '@prisma/client';
import { CurrentUser, Protected } from '../platform/common.js';
import { ReorderDto } from '../admin-content/admin-content.dto.js';
import { BookDto, BookQuery, UpdateBookDto } from './books.dto.js';
import { BooksService } from './books.service.js';
import { BookUploadInterceptor } from './book-upload.interceptor.js';

const createBody = {
  schema: {
    type: 'object',
    required: ['file', 'title'],
    properties: {
      file: { type: 'string', format: 'binary' },
      title: { type: 'string', minLength: 2, maxLength: 120 },
      description: { type: 'string', maxLength: 500 },
      canView: { type: 'string', enum: ['true', 'false'], default: 'true' },
      canDownload: {
        type: 'string',
        enum: ['true', 'false'],
        default: 'false',
      },
      status: {
        type: 'string',
        enum: ['draft', 'published'],
        default: 'draft',
      },
    },
  },
};

@Controller()
@Protected('admin-books', 'super_admin', 'page_admin')
export class AdminBooksController {
  constructor(@Inject(BooksService) private readonly service: BooksService) {}

  @Post('admin/courses/:id/books')
  @ApiOperation({ summary: 'Upload a course book' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(createBody)
  @UseInterceptors(BookUploadInterceptor)
  createCourse(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BookDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.create(user, { courseId: id }, dto, file);
  }

  @Post('admin/chapters/:id/books')
  @ApiOperation({ summary: 'Upload a chapter book' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(createBody)
  @UseInterceptors(BookUploadInterceptor)
  createChapter(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BookDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.create(user, { chapterId: id }, dto, file);
  }

  @Get('admin/courses/:id/books')
  @ApiOperation({ summary: 'List course and chapter books' })
  list(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: BookQuery,
  ) {
    return this.service.list(user, id, query);
  }

  @Get('admin/books/:id')
  @ApiOperation({ summary: 'Book detail with a one-hour admin preview' })
  detail(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(user, id);
  }

  @Patch('admin/books/:id')
  @ApiOperation({ summary: 'Update book fields or individual permissions' })
  update(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBookDto,
  ) {
    return this.service.update(user, id, dto);
  }

  @Put('admin/books/:id/file')
  @ApiOperation({ summary: 'Replace a book PDF' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(BookUploadInterceptor)
  replace(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.replace(user, id, file);
  }

  @Delete('admin/books/:id')
  @ApiOperation({ summary: 'Delete a book' })
  delete(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.delete(user, id);
  }

  @Put('admin/courses/:id/books/reorder')
  @ApiOperation({ summary: 'Reorder course-level books' })
  reorderCourse(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderDto,
  ) {
    return this.service.reorder(user, { courseId: id }, dto.ids);
  }

  @Put('admin/chapters/:id/books/reorder')
  @ApiOperation({ summary: 'Reorder chapter books' })
  reorderChapter(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderDto,
  ) {
    return this.service.reorder(user, { chapterId: id }, dto.ids);
  }
}

@Controller()
@Protected('books', 'learner')
export class BooksController {
  constructor(@Inject(BooksService) private readonly service: BooksService) {}

  @Get('courses/:id/books')
  @ApiOperation({ summary: 'Published course-level books' })
  course(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.learnerList(user.id, { courseId: id });
  }

  @Get('chapters/:id/books')
  @ApiOperation({ summary: 'Published chapter books' })
  chapter(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.learnerList(user.id, { chapterId: id });
  }

  @Get('books/:id/view')
  @ApiOperation({ summary: 'Get a five-minute inline PDF URL' })
  view(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.learnerUrl(user.id, id, 'view');
  }

  @Get('books/:id/download')
  @ApiOperation({ summary: 'Get a five-minute PDF download URL' })
  download(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.learnerUrl(user.id, id, 'download');
  }
}
