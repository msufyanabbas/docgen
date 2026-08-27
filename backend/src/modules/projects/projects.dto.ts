import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateProjectDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() projectCategoryId!: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

export class UpdateProjectDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() projectCategoryId?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}
