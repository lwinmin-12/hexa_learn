import {ApiProperty, ApiPropertyOptional, PartialType} from '@nestjs/swagger';
import {IsString, MinLength, MaxLength, IsOptional, IsUUID, IsInt, Min, IsBoolean, IsArray, ArrayMinSize, ArrayMaxSize, ValidateNested} from 'class-validator';
import {Type} from 'class-transformer';
export class QuizDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) title: string;
  @ApiProperty() @IsInt() @Min(0) passScore: number;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  timeLimitSec?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUUID() courseId?:
    string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUUID() chapterId?:
    string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUUID() episodeId?:
    string | null;
}
export class UpdateQuizDto extends PartialType(QuizDto) {}
export class OptionDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(4000) optionText: string;
  @ApiProperty() @IsBoolean() isCorrect: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) position?: number;
}
export class UpdateOptionDto extends PartialType(OptionDto) {}
export class QuestionFieldsDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  questionText: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) position?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) points?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  explanation?: string;
}
export class QuestionDto extends QuestionFieldsDto {
  @ApiProperty({ type: [OptionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => OptionDto)
  options: OptionDto[];
}
export class UpdateQuestionDto extends PartialType(QuestionFieldsDto) {}
