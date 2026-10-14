import {ApiProperty, ApiPropertyOptional, PartialType} from '@nestjs/swagger';
import {IsString, MinLength, MaxLength, IsOptional, IsInt, Min, IsIn, IsUrl} from 'class-validator';
import {Type} from 'class-transformer';
export class FlashcardDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(4000) frontText: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(4000) backText: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  audioUrl?: string;
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
