import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/auth.dto.js';
import {
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentAuth, FirebaseAuthGuard } from './guard/auth.guard.js';
import type { AuthContext } from './guard/auth.guard.js';
@Controller('auth')
@ApiTags('Authentication')
@ApiUnauthorizedResponse({
  description: 'Missing, invalid, expired, or revoked Firebase ID token.',
})
@ApiForbiddenResponse({ description: 'Account is suspended or deleted.' })
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('login')
  @ApiOperation({
    summary: 'Sign in with Google, Apple, or Facebook',
    description:
      'Sign in using the Firebase client SDK first, then submit the Firebase ID token. Creates an account on first login.',
  })
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.idToken);
  }

  // @Post('phone/send-otp')
  // @HttpCode(200)
  // @UseGuards(FirebaseAuthGuard)
  // sendOtp(@CurrentAuth() auth: AuthContext, @Body() dto: SendOtpDto) {
  //   return this.auth.sendOtp(auth.user.id, dto);
  // }

  // @Post('phone/verify-otp')
  // @HttpCode(200)
  // @UseGuards(FirebaseAuthGuard)
  // verifyOtp(@CurrentAuth() auth: AuthContext, @Body() dto: VerifyOtpDto) {
  //   return this.auth.verifyOtp(auth, dto);
  // }
}
