import {Controller, Get, Post, Body, Query, Param, ParseUUIDPipe, Inject} from '@nestjs/common';
import {ApiOperation} from '@nestjs/swagger';
import type { User } from '@prisma/client';
import {CurrentUser, Protected, PageDto} from '../platform/common.js';
import {PaymentsService} from './payments.service.js';
import {PaymentDto, PromoPreviewDto} from './payments.dto.js';
import {UseInterceptors, UploadedFile} from '@nestjs/common';
import {FileInterceptor} from '@nestjs/platform-express';
import {ApiConsumes, ApiBody} from '@nestjs/swagger';
@Controller()
@Protected('payments', 'learner')
export class PaymentsController {
  constructor(
    @Inject(PaymentsService) private readonly service: PaymentsService,
  ) {}
  @Get('payment-methods')
  @ApiOperation({ summary: 'GET payment-methods' })
  methods(@Query() q: PageDto) {
    return this.service.methods(q);
  }
  @Post('promo-codes/validate')
  @ApiOperation({ summary: 'POST promo-codes/validate' })
  preview(@Body() dto: PromoPreviewDto) {
    return this.service.preview(dto);
  }
  @Post('payments')
  @ApiOperation({ summary: 'POST payments' })
  create(@CurrentUser() user: User, @Body() dto: PaymentDto) {
    return this.service.create(user.id, dto);
  }
  @Get('payments/:id')
  @ApiOperation({ summary: 'GET payments/:id' })
  detail(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(user.id, id);
  }
  @Get('me/payments')
  @ApiOperation({ summary: 'GET me/payments' })
  mine(@CurrentUser() user: User, @Query() q: PageDto) {
    return this.service.mine(user.id, q);
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
  @Post('payments/:id/slip')
  @ApiOperation({ summary: 'POST payments/:id/slip' })
  slip(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.slip(user.id, id, file);
  }
}
