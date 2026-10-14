import {Controller, Get, Put, Body, Param, ParseUUIDPipe, Inject} from '@nestjs/common';
import {ApiOperation} from '@nestjs/swagger';
import type { User } from '@prisma/client';
import {CurrentUser, Protected} from '../platform/common.js';
import {ProgressService} from './progress.service.js';
import {ProgressDto} from '../courses/courses.dto.js';
@Controller()
@Protected('progress', 'learner')
export class ProgressController {
  constructor(
    @Inject(ProgressService) private readonly service: ProgressService,
  ) {}
  @Put('episodes/:id/progress')
  @ApiOperation({ summary: 'PUT episodes/:id/progress' })
  save(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProgressDto,
  ) {
    return this.service.save(user.id, id, dto);
  }
  @Get('episodes/:id/progress')
  @ApiOperation({ summary: 'GET episodes/:id/progress' })
  resume(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.resume(user.id, id);
  }
  @Get('courses/:id/progress')
  @ApiOperation({ summary: 'GET courses/:id/progress' })
  course(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.course(user.id, id);
  }
}
