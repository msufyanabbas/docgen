import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateProjectDto {
  @IsString() @MinLength(2) name!: string;
  /** RMS | CCTV | SIM_SWAP | SMART_LOCKS — decides the available MOBs. */
  @IsString() type!: string;
  /** Narrow the MOBs created; omit to take every one the type allows. */
  @IsOptional() @IsArray() @IsString({ each: true }) mobTypes?: string[];
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() colour?: string;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

export class UpdateProjectDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() colour?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

export class CreateMobDto {
  /** SURVEY | INSTALLATION | PAT — must be allowed by the project's type. */
  @IsString() mobType!: string;
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() defaultTcnSummary?: string;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

export class UpdateMobDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() templateKey?: string;
  @IsOptional() @IsString() defaultTcnSummary?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}
