import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class UpsertProjectCategoryDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() colour?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

export class UpsertMopCategoryDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

/** Links a MOP category to a project category and says which Word file it makes. */
export class UpsertTemplateLinkDto {
  @IsString() projectCategoryId!: string;
  @IsString() mopCategoryId!: string;
  @IsString() templateKey!: string;
  @IsOptional() @IsString() defaultTcnSummary?: string;
}
