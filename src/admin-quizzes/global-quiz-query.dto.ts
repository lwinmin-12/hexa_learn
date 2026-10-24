import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PageDto } from '../platform/common.js';

export class GlobalQuizQueryDto extends PageDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() courseId?: string;
  @ApiPropertyOptional({ enum: ['course', 'chapter', 'episode'] })
  @IsOptional() @IsIn(['course', 'chapter', 'episode']) scope?: 'course' | 'chapter' | 'episode';
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) search?: string;
  @ApiPropertyOptional({ enum: ['newest', 'title', 'attempts', 'passRate'] })
  @IsOptional() @IsIn(['newest', 'title', 'attempts', 'passRate']) sort?: 'newest' | 'title' | 'attempts' | 'passRate';
}
