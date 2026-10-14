import {Controller, Get, Post, Patch, Delete, Body, Query, Param, ParseUUIDPipe, Inject} from '@nestjs/common';
import {ApiOperation} from '@nestjs/swagger';
import type { User } from '@prisma/client';
import {CurrentUser, Protected, PageDto, Roles} from '../platform/common.js';
import {AdminPaymentsService} from './admin-payments.service.js';
import {PaymentQuery, RejectDto, PaymentMethodDto, UpdateMethodDto, PromoDto, UpdatePromoDto} from '../payments/payments.dto.js';
@Controller()
@Protected('admin-payments', 'super_admin', 'page_admin')
export class AdminPaymentsController {
  constructor(
    @Inject(AdminPaymentsService)
    private readonly service: AdminPaymentsService,
  ) {}
  @Get('admin/payments')
  @ApiOperation({ summary: 'GET admin/payments' })
  list(@CurrentUser() user: User, @Query() q: PaymentQuery) {
    return this.service.list(user, q);
  }
  @Get('admin/payments/:id')
  @ApiOperation({ summary: 'GET admin/payments/:id' })
  detail(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(user, id);
  }
  @Post('admin/payments/:id/approve')
  @ApiOperation({ summary: 'POST admin/payments/:id/approve' })
  approve(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.approve(user, id);
  }
  @Post('admin/payments/:id/reject')
  @ApiOperation({ summary: 'POST admin/payments/:id/reject' })
  reject(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectDto,
  ) {
    return this.service.reject(user, id, dto);
  }
  @Roles('super_admin')
  @Get('admin/payment-methods')
  @ApiOperation({ summary: 'GET admin/payment-methods' })
  methods(@Query() q: PageDto) {
    return this.service.methods(q);
  }
  @Roles('super_admin')
  @Post('admin/payment-methods')
  @ApiOperation({ summary: 'POST admin/payment-methods' })
  createMethod(@Body() dto: PaymentMethodDto) {
    return this.service.createMethod(dto);
  }
  @Roles('super_admin')
  @Patch('admin/payment-methods/:id')
  @ApiOperation({ summary: 'PATCH admin/payment-methods/:id' })
  updateMethod(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMethodDto) {
    return this.service.updateMethod(id, dto);
  }
  @Roles('super_admin')
  @Delete('admin/payment-methods/:id')
  @ApiOperation({ summary: 'DELETE admin/payment-methods/:id' })
  deleteMethod(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteMethod(id);
  }
  @Get('admin/promo-codes')
  @ApiOperation({ summary: 'GET admin/promo-codes' })
  promos(@CurrentUser() user: User, @Query() q: PageDto) {
    return this.service.promos(user, q);
  }
  @Post('admin/promo-codes')
  @ApiOperation({ summary: 'POST admin/promo-codes' })
  createPromo(@CurrentUser() user: User, @Body() dto: PromoDto) {
    return this.service.createPromo(user, dto);
  }
  @Patch('admin/promo-codes/:id')
  @ApiOperation({ summary: 'PATCH admin/promo-codes/:id' })
  updatePromo(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePromoDto,
  ) {
    return this.service.updatePromo(user, id, dto);
  }
  @Delete('admin/promo-codes/:id')
  @ApiOperation({ summary: 'DELETE admin/promo-codes/:id' })
  deletePromo(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deletePromo(user, id);
  }
}
