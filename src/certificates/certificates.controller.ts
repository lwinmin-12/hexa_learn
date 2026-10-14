import {Controller, Get, Post, Query, Param, ParseUUIDPipe, Inject} from '@nestjs/common';
import {ApiOperation} from '@nestjs/swagger';
import type { User } from '@prisma/client';
import {CurrentUser, Protected, PageDto} from '../platform/common.js';
import {CertificatesService} from './certificates.service.js';

@Controller()
@Protected('certificates', 'learner')
export class CertificatesController {
  constructor(
    @Inject(CertificatesService) private readonly service: CertificatesService,
  ) {}
  @Get('me/certificates')
  @ApiOperation({ summary: 'GET me/certificates' })
  list(@CurrentUser() user: User, @Query() q: PageDto) {
    return this.service.list(user.id, q);
  }
  @Get('certificates/:id')
  @ApiOperation({ summary: 'GET certificates/:id' })
  detail(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(user.id, id);
  }
  @Post('courses/:id/certificate')
  @ApiOperation({ summary: 'POST courses/:id/certificate' })
  claim(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.claim(user.id, id);
  }
}

import {ApiTags} from '@nestjs/swagger';
@Controller('certificates/verify')
@ApiTags('certificates')
export class CertificateVerificationController {
  constructor(
    @Inject(CertificatesService) private readonly service: CertificatesService,
  ) {}
  @Get(':no')
  @ApiOperation({ summary: 'Verify a certificate publicly' })
  verify(@Param('no') no: string) {
    return this.service.verify(no);
  }
}
