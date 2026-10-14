import {ApiProperty, ApiPropertyOptional, PartialType} from '@nestjs/swagger';
import {IsUUID, IsString, IsOptional, MaxLength, MinLength, IsIn, IsBoolean, IsInt, Min, IsDateString, Matches, IsUrl} from 'class-validator';
import {PageDto} from '../platform/common.js';
export class PromoPreviewDto {
  @ApiProperty() @IsUUID() courseId: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(80) code: string;
}
export class PaymentDto {
  @ApiProperty() @IsUUID() courseId: string;
  @ApiProperty() @IsUUID() paymentMethodId: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  promoCode?: string;
}
export class RejectDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  rejectReason: string;
}
export class PaymentQuery extends PageDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() courseId?: string;
  @ApiPropertyOptional({
    enum: ['pending', 'slip_uploaded', 'approved', 'rejected'],
  })
  @IsOptional()
  @IsIn(['pending', 'slip_uploaded', 'approved', 'rejected'])
  status?: 'pending' | 'slip_uploaded' | 'approved' | 'rejected';
}
export class PaymentMethodDto {
  @ApiProperty({ enum: ['qr', 'bank_transfer'] })
  @IsIn(['qr', 'bank_transfer'])
  type: 'qr' | 'bank_transfer';
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) name: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  accountName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  accountNo?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  qrImageUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateMethodDto extends PartialType(PaymentMethodDto) {}
export class PromoDto {
  @ApiProperty() @IsString() @Matches(/^[A-Za-z0-9_-]{1,80}$/) code: string;
  @ApiProperty({ enum: ['percent', 'fixed'] })
  @IsIn(['percent', 'fixed'])
  discountType: 'percent' | 'fixed';
  @ApiProperty({ type: String })
  @IsString()
  @Matches(/^\d{1,10}(\.\d{1,2})?$/)
  discountValue: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsUUID() courseId?:
    string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  validFrom?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  validTo?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdatePromoDto extends PartialType(PromoDto) {}
