import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Firebase ID token obtained after signing in',
    maxLength: 16384,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(16384)
  idToken!: string;
}

export class SendOtpDto {
  @ApiProperty({ example: '+84912345678', pattern: '^\\+[1-9]\\d{7,14}$' })
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(16384)
  @ApiProperty({ maxLength: 16384 })
  recaptchaToken!: string;
}

export class VerifyOtpDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  verificationId!: string;

  @Matches(/^\d{6}$/)
  @ApiProperty({ example: '123456', pattern: '^\\d{6}$' })
  code!: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string | null;

  @IsOptional()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  @MaxLength(2048)
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'uri',
    maxLength: 2048,
  })
  avatarUrl?: string | null;
}

export class RegisterDeviceDto {
  @ApiProperty({
    description: 'Push notification device token',
    maxLength: 4096,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  token!: string;

  @IsIn(['ios', 'android', 'web'])
  @ApiProperty({ enum: ['ios', 'android', 'web'] })
  platform!: string;
}
