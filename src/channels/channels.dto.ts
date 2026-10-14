import {ApiProperty, ApiPropertyOptional} from '@nestjs/swagger';
import {IsBoolean, IsString, IsOptional, MinLength, MaxLength} from 'class-validator';
import {Transform} from 'class-transformer';
import {PageDto} from '../platform/common.js';
import {queryBool} from '../courses/courses.dto.js';
export class MuteDto {
  @ApiProperty() @IsBoolean() isMuted: boolean;
}
export class ChannelDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) name: string;
}
export class MessageDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) title: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(4000) body: string;
}
export class NotificationQuery extends PageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(queryBool)
  @IsBoolean()
  unread?: boolean;
}
