import {
  Body,
  Controller,
  Header,
  HttpCode,
  Inject,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminLoginDto, AdminRefreshDto } from './dto/admin-auth.dto.js';

@Controller('admin/auth')
@ApiTags('Admin authentication')
export class AdminAuthController {
  constructor(
    @Inject(AdminAuthService) private readonly auth: AdminAuthService,
  ) {}

  @Post('login')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Sign in an existing admin with email and password',
  })
  login(@Body() dto: AdminLoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Post('refresh')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @ApiOperation({ summary: 'Refresh an active admin session' })
  refresh(@Body() dto: AdminRefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }
}
