import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsInt,
  Min,
  IsIn,
  IsUrl,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
export class FlashcardDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(4000) frontText: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(4000) backText: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'Optional audio URL. Omit to keep unchanged; null or blank clears it.',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @IsOptional()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  audioUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) position?: number;
}
export class UpdateFlashcardDto extends PartialType(FlashcardDto) {}
export class AudioDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) title: string;
  @ApiProperty({ enum: ['vocab', 'speaking'] })
  @IsIn(['vocab', 'speaking'])
  type: 'vocab' | 'speaking';
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationSec?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;
}
export class UpdateAudioDto extends PartialType(AudioDto) {}
