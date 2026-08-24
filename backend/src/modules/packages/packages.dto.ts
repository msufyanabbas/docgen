import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { PackageStatus, QuantitySource } from '@prisma/client';

export class CreateFromGclDto {
  @IsOptional() @IsEnum(QuantitySource) quantitySource?: QuantitySource;
  @IsOptional() @IsString() uplVersion?: string;
  @IsOptional() @IsString() woNumber?: string;
  @IsOptional() @IsString() siteNo?: string;
  @IsOptional() @IsString() contractorName?: string;

  @IsOptional() @Type(() => Date) @IsDate() handoverDate?: Date;
  @IsOptional() @Type(() => Date) @IsDate() startDate?: Date;
  @IsOptional() @Type(() => Date) @IsDate() endDate?: Date;
  @IsOptional() @Type(() => Date) @IsDate() serviceDate?: Date;

  @IsOptional() @IsString() contractorPmName?: string;
  @IsOptional() @IsString() contractorPmId?: string;
  @IsOptional() @IsString() tawalPmName?: string;
  @IsOptional() @IsString() tawalPmId?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) poValue?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) discount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) foc?: number;

  @IsOptional() @Type(() => Boolean) @IsBoolean() overwrite?: boolean;
}

export class UpdateLineDto {
  @IsString() id!: string;
  @IsOptional() @IsString() tagNumber?: string;
  @IsOptional() @IsString() serialNumber?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Date) @IsDate() serviceDate?: Date;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) designQty?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) asBuiltQty?: number;
}

export class UpdatePackageDto {
  @IsOptional() @IsEnum(QuantitySource) quantitySource?: QuantitySource;
  @IsOptional() @IsEnum(PackageStatus) status?: PackageStatus;

  @IsOptional() @IsString() siteNo?: string;
  @IsOptional() @IsString() tawalSiteId?: string;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() projectName?: string;
  @IsOptional() @IsString() contractorName?: string;
  @IsOptional() @IsString() poNumber?: string;
  @IsOptional() @IsString() notes?: string;

  @IsOptional() @Type(() => Date) @IsDate() gclDate?: Date;
  @IsOptional() @Type(() => Date) @IsDate() serviceDate?: Date;
  @IsOptional() @Type(() => Date) @IsDate() handoverDate?: Date;
  @IsOptional() @Type(() => Date) @IsDate() startDate?: Date;
  @IsOptional() @Type(() => Date) @IsDate() endDate?: Date;

  @IsOptional() @IsString() contractorPmName?: string;
  @IsOptional() @IsString() contractorPmId?: string;
  @IsOptional() @IsString() mspRepName?: string;
  @IsOptional() @IsString() tawalPmName?: string;
  @IsOptional() @IsString() tawalPmId?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) poValue?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) discount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) foc?: number;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => UpdateLineDto)
  lines?: UpdateLineDto[];
}

export class QueryPackagesDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(PackageStatus) status?: PackageStatus;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() limit?: number;
}
