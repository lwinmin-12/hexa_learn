import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService, profile } from './auth.service.js';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { RegisterDeviceDto, UpdateProfileDto } from './dto/auth.dto.js';
import { AccountDeletionService } from './account-deletion.service.js';
import { CurrentAuth, FirebaseAuthGuard } from './guard/auth.guard.js';
import type { AuthContext } from './guard/auth.guard.js';

@Controller('me')
@ApiTags('Account')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
export class MeController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AccountDeletionService)
    private readonly deletion: AccountDeletionService,
  ) {}

  @Get()
  me(@CurrentAuth() auth: AuthContext) {
    return profile(auth.user);
  }

  @Patch()
  update(@CurrentAuth() auth: AuthContext, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(auth.user.id, dto);
  }

  @Delete()
  @HttpCode(202)
  async delete(@CurrentAuth() auth: AuthContext) {
    await this.auth.deleteAccount(auth);
    void this.deletion.flush();
    return { status: 'deleted', firebaseDeletion: 'queued' };
  }

  @Post('device-tokens')
  registerDevice(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: RegisterDeviceDto,
  ) {
    return this.auth.registerDevice(auth.user.id, dto);
  }

  @Delete('device-tokens/:token')
  @HttpCode(204)
  removeDevice(
    @CurrentAuth() auth: AuthContext,
    @Param('token') token: string,
  ) {
    return this.auth.removeDevice(auth.user.id, token);
  }
}
