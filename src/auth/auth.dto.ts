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
  @IsString()
  @IsNotEmpty()
  @MaxLength(16384)
  idToken!: string;
}

export class SendOtpDto {
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(16384)
  recaptchaToken!: string;
}

export class VerifyOtpDto {
  @IsUUID()
  verificationId!: string;

  @Matches(/^\d{6}$/)
  code!: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string | null;

  @IsOptional()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  @MaxLength(2048)
  avatarUrl?: string | null;
}

export class RegisterDeviceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  token!: string;

  @IsIn(['ios', 'android', 'web'])
  platform!: string;
}
