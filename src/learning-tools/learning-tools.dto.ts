import {ApiPropertyOptional} from '@nestjs/swagger';
import {IsOptional, IsIn} from 'class-validator';
import {PageDto} from '../platform/common.js';
export class AudioQuery extends PageDto {
  @ApiPropertyOptional({ enum: ['vocab', 'speaking'] })
  @IsOptional()
  @IsIn(['vocab', 'speaking'])
  type?: 'vocab' | 'speaking';
}
