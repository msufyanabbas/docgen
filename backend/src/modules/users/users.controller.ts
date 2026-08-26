import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { UsersService } from './users.service';
import { CreateUserDto, QueryUsersDto, ResetPasswordDto, UpdateUserDto } from './users.dto';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';

/** User management is Admin-only; the guard is on the controller, so every
 *  route below inherits it. */
@ApiTags('Users')
@Controller('users')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  findAll(@Query() q: QueryUsersDto) {
    return this.users.findAll(q);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.users.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser('id') creatorId: string) {
    return this.users.create(dto, creatorId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser('id') actingUserId: string) {
    return this.users.update(id, dto, actingUserId);
  }

  @Post(':id/reset-password')
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.users.resetPassword(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('id') actingUserId: string) {
    return this.users.remove(id, actingUserId);
  }
}
