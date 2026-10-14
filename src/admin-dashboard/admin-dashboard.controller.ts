import {Controller, Get, Query, Param, ParseUUIDPipe, Inject} from '@nestjs/common';
import {ApiOperation} from '@nestjs/swagger';
import type { User } from '@prisma/client';
import {CurrentUser, Protected, PageDto} from '../platform/common.js';
import {AdminDashboardService} from './admin-dashboard.service.js';
import {RevenueQuery} from './admin-dashboard.dto.js';
@Controller()
@Protected('admin-dashboard', 'super_admin', 'page_admin')
export class AdminDashboardController {
  constructor(
    @Inject(AdminDashboardService)
    private readonly service: AdminDashboardService,
  ) {}
  @Get('admin/dashboard/summary')
  @ApiOperation({ summary: 'GET admin/dashboard/summary' })
  summary(@CurrentUser() user: User) {
    return this.service.summary(user);
  }
  @Get('admin/dashboard/revenue')
  @ApiOperation({ summary: 'GET admin/dashboard/revenue' })
  revenue(@CurrentUser() user: User, @Query() q: RevenueQuery) {
    return this.service.revenue(user, q);
  }
  @Get('admin/dashboard/top-courses')
  @ApiOperation({ summary: 'GET admin/dashboard/top-courses' })
  top(@CurrentUser() user: User) {
    return this.service.top(user);
  }
  @Get('admin/courses/:id/learners')
  @ApiOperation({ summary: 'GET admin/courses/:id/learners' })
  learners(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PageDto,
  ) {
    return this.service.learners(user, id, q);
  }
  @Get('admin/courses/:id/stats')
  @ApiOperation({ summary: 'GET admin/courses/:id/stats' })
  stats(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.stats(user, id);
  }
  @Get('admin/scheduled-content')
  @ApiOperation({ summary: 'GET admin/scheduled-content' })
  scheduled(@CurrentUser() user: User, @Query() q: PageDto) {
    return this.service.scheduled(user, q);
  }
}
