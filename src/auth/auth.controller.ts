import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { CurrentAuth, FirebaseAuthGuard } from './auth.guard.js';
import type { AuthContext } from './auth.guard.js';
import { LoginDto, SendOtpDto, VerifyOtpDto } from './auth.dto.js';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.idToken);
  }

  @Post('phone/send-otp')
  @HttpCode(200)
  @UseGuards(FirebaseAuthGuard)
  sendOtp(@CurrentAuth() auth: AuthContext, @Body() dto: SendOtpDto) {
    return this.auth.sendOtp(auth.user.id, dto);
  }

  @Post('phone/verify-otp')
  @HttpCode(200)
  @UseGuards(FirebaseAuthGuard)
  verifyOtp(@CurrentAuth() auth: AuthContext, @Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(auth, dto);
  }
}
