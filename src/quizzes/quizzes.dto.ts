import {ApiProperty} from '@nestjs/swagger';
import {Type} from 'class-transformer';
import {IsArray, ArrayMaxSize, ArrayUnique, IsUUID, ValidateNested} from 'class-validator';
export class AnswerDto {
  @ApiProperty() @IsUUID() questionId: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  optionIds: string[];
}
export class SubmitDto {
  @ApiProperty({ type: [AnswerDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers: AnswerDto[];
}
