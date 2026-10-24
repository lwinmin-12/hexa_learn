import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AdminLoginDto {
  @ApiProperty({ example: 'admin@example.com', maxLength: 254 })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ writeOnly: true, maxLength: 4096 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  password!: string;
}

export class AdminRefreshDto {
  @ApiProperty({ writeOnly: true, maxLength: 16384 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(16384)
  refreshToken!: string;
}
