import {ApiPropertyOptional, ApiProperty} from '@nestjs/swagger';
import {Transform} from 'class-transformer';
import {IsBoolean, IsOptional, IsString, MaxLength, IsInt, Min} from 'class-validator';
import {PageDto} from '../platform/common.js';
export const queryBool = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;
export class CourseQuery extends PageDto {
  @ApiPropertyOptional()
  @Transform(queryBool)
  @IsOptional()
  @IsBoolean()
  isPremium?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
export class ProgressDto {
  @ApiProperty() @IsInt() @Min(0) watchedSec: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isCompleted?: boolean;
}
