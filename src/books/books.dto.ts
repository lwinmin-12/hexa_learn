import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PageDto } from '../platform/common.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const boolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class BookDto {
  @ApiProperty({ minLength: 2, maxLength: 120 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title: string;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional({ default: true })
  @Transform(boolean)
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  canView?: boolean;

  @ApiPropertyOptional({ default: false })
  @Transform(boolean)
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  canDownload?: boolean;

  @ApiPropertyOptional({ enum: ['draft', 'published'], default: 'draft' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['draft', 'published'])
  status?: 'draft' | 'published';
}

export class UpdateBookDto extends PartialType(BookDto, {
  skipNullProperties: false,
}) {}

export class BookQuery extends PageDto {
  @ApiPropertyOptional({ enum: ['course', 'chapter'] })
  @IsOptional()
  @IsIn(['course', 'chapter'])
  scope?: 'course' | 'chapter';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  chapterId?: string;

  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}
