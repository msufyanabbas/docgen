import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';
import { SiteImpact } from '@prisma/client';

export class CreateMopDto {
  @IsString() mobId!: string;
  @IsString() @MinLength(2, { message: 'Site ID is required' }) siteId!: string;
  @IsOptional() @IsString() tcnSummary?: string;
  @IsString() @MinLength(2, { message: 'Name of Requester is required' }) requesterName!: string;
  @IsString() @MinLength(2, { message: 'Name of PM is required' }) pmName!: string;
  @IsOptional() @IsEnum(SiteImpact) siteImpact?: SiteImpact;
  @IsOptional() @IsString() siteImpactNote?: string;
}

export class QueryMopDto {
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsString() mobId?: string;
  @IsOptional() @IsString() batchId?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() limit?: number;
}

export class BulkMopDto {
  @IsString() mobId!: string;
  /** Used for any row that leaves the column blank. */
  @IsOptional() @IsString() requesterName?: string;
  @IsOptional() @IsString() pmName?: string;
}
