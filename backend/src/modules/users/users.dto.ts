import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsInt, IsObject, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
  @IsEmail({}, { message: 'Enter a valid email address' }) email!: string;
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(8, { message: 'Password must be at least 8 characters' }) password!: string;
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  /** Per-resource grants; omitted means the default for the role. */
  @IsOptional() @IsObject() permissions?: Record<string, Record<string, boolean>>;
}

export class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsObject() permissions?: Record<string, Record<string, boolean>>;
}

export class ResetPasswordDto {
  @IsString() @MinLength(8) newPassword!: string;
}

export class QueryUsersDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() limit?: number;
}
