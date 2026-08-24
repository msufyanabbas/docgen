import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class QueryUplDto {
  @IsOptional() @IsString() version?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() activeOnly?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() limit?: number;
}

export class UpsertUplItemDto {
  @IsOptional() @IsString() version?: string;
  @IsString() @MinLength(3) itemCode!: string;
  @IsString() description!: string;
  @IsOptional() @IsString() categoryName?: string;
  @IsOptional() @IsString() uom?: string;
  @Type(() => Number) @IsNumber() @Min(0) price!: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() line?: number;
}
