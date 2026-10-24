import { Module } from '@nestjs/common';
import { CoursesModule } from '../courses/courses.module.js';
import { AdminBooksController, BooksController } from './books.controller.js';
import { BooksService } from './books.service.js';
import { BookUploadInterceptor } from './book-upload.interceptor.js';

@Module({
  imports: [CoursesModule],
  controllers: [AdminBooksController, BooksController],
  providers: [BooksService, BookUploadInterceptor],
})
export class BooksModule {}
