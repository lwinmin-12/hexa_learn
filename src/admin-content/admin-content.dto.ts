import {ApiProperty, ApiPropertyOptional, PartialType} from '@nestjs/swagger';
import {IsString, MinLength, MaxLength, IsOptional, IsBoolean, IsIn, IsDateString, IsISO8601, Matches, IsInt, Min, IsArray, ArrayUnique, IsUUID, ArrayMaxSize} from 'class-validator';
import {CourseQuery} from '../courses/courses.dto.js';
export class AdminCourseQuery extends CourseQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['draft', 'scheduled', 'published'])
  status?: 'draft' | 'scheduled' | 'published';
}
export class CourseDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) title: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(200)
  slug?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPremium?: boolean;
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,10}(\.\d{1,2})?$/)
  price?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^[A-Za-z]{3}$/)
  currency?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['draft', 'scheduled', 'published'])
  status?: 'draft' | 'scheduled' | 'published';
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  publishAt?: string | null;
}
export class UpdateCourseDto extends PartialType(CourseDto) {}
export class ChapterDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) title: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['draft', 'scheduled', 'published'])
  status?: 'draft' | 'scheduled' | 'published';
}
export class UpdateChapterDto extends PartialType(ChapterDto) {}
export class EpisodeDto extends ChapterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  description?: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/, { message: 'publishAt must be an ISO 8601 UTC timestamp ending in Z' })
  publishAt?: string | null;
}
export class UpdateEpisodeDto extends PartialType(EpisodeDto) {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/)
  scheduledAt?: string | null;
}
export class ReorderDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(10000)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids: string[];
}
export class UploadVideoDto {
  @ApiProperty({ enum: ['mp4', 'mov', 'webm'] })
  @IsIn(['mp4', 'mov', 'webm'])
  ext: 'mp4' | 'mov' | 'webm';
}
export class ConfirmVideoDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/)
  publishAt?: string | null;
  @ApiProperty() @IsString() @MaxLength(500) storageKey: string;
  @ApiProperty() @IsInt() @Min(1) durationSec: number;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/)
  scheduledAt?: string | null;
}
