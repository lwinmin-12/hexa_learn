import {Controller, Get, Post, Query, Param, ParseUUIDPipe, Inject} from '@nestjs/common';
import {ApiOperation} from '@nestjs/swagger';
import type { User } from '@prisma/client';
import {CurrentUser, Protected, PageDto, Roles} from '../platform/common.js';
import {CoursesService} from './courses.service.js';
import {CourseQuery} from './courses.dto.js';
@Controller()
@Protected('courses', 'learner')
export class CoursesController {
  constructor(
    @Inject(CoursesService) private readonly service: CoursesService,
  ) {}
  @Roles('learner', 'page_admin', 'super_admin')
  @Get('courses')
  @ApiOperation({ summary: 'GET courses' })
  list(@Query() q: CourseQuery) {
    return this.service.list(q);
  }
  @Roles('learner', 'page_admin', 'super_admin')
  @Get('courses/:idOrSlug')
  @ApiOperation({ summary: 'GET courses/:idOrSlug' })
  detail(@Param('idOrSlug') id: string) {
    return this.service.detail(id);
  }
  @Get('me/courses')
  @ApiOperation({ summary: 'GET me/courses' })
  mine(@CurrentUser() user: User, @Query() q: PageDto) {
    return this.service.mine(user.id, q);
  }
  @Post('courses/:id/enroll')
  @ApiOperation({ summary: 'POST courses/:id/enroll' })
  enroll(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.enroll(user.id, id);
  }
  @Get('courses/:id/access')
  @ApiOperation({ summary: 'GET courses/:id/access' })
  check(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.check(user.id, id);
  }
}
