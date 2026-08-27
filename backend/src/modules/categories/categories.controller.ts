import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CategoriesService } from './categories.service';
import { UpsertMopCategoryDto, UpsertProjectCategoryDto, UpsertTemplateLinkDto } from './categories.dto';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@ApiTags('Categories')
@Controller('categories')
@UseGuards(RolesGuard)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  // --- readable by anyone signed in ---

  @Get('projects')
  projectCategories(@Query('includeInactive') inc?: string) {
    return this.categories.projectCategories(inc === 'true');
  }

  @Get('mops')
  mopCategories(@Query('includeInactive') inc?: string) {
    return this.categories.mopCategories(inc === 'true');
  }

  @Get('templates')
  templates() {
    return this.categories.templates();
  }

  @Get('projects/:id/available')
  availableFor(@Param('id') id: string) {
    return this.categories.availableFor(id);
  }

  // --- changes are Admin-only ---

  @Post('projects')
  @Roles(UserRole.ADMIN)
  createProjectCategory(@Body() dto: UpsertProjectCategoryDto) {
    return this.categories.createProjectCategory(dto);
  }

  @Patch('projects/:id')
  @Roles(UserRole.ADMIN)
  updateProjectCategory(@Param('id') id: string, @Body() dto: Partial<UpsertProjectCategoryDto>) {
    return this.categories.updateProjectCategory(id, dto);
  }

  @Delete('projects/:id')
  @Roles(UserRole.ADMIN)
  removeProjectCategory(@Param('id') id: string) {
    return this.categories.removeProjectCategory(id);
  }

  @Post('mops')
  @Roles(UserRole.ADMIN)
  createMopCategory(@Body() dto: UpsertMopCategoryDto) {
    return this.categories.createMopCategory(dto);
  }

  @Patch('mops/:id')
  @Roles(UserRole.ADMIN)
  updateMopCategory(@Param('id') id: string, @Body() dto: Partial<UpsertMopCategoryDto>) {
    return this.categories.updateMopCategory(id, dto);
  }

  @Delete('mops/:id')
  @Roles(UserRole.ADMIN)
  removeMopCategory(@Param('id') id: string) {
    return this.categories.removeMopCategory(id);
  }

  @Post('links')
  @Roles(UserRole.ADMIN)
  link(@Body() dto: UpsertTemplateLinkDto) {
    return this.categories.linkTemplate(dto);
  }

  @Delete('links/:projectCategoryId/:mopCategoryId')
  @Roles(UserRole.ADMIN)
  unlink(
    @Param('projectCategoryId') projectCategoryId: string,
    @Param('mopCategoryId') mopCategoryId: string,
  ) {
    return this.categories.unlinkTemplate(projectCategoryId, mopCategoryId);
  }
}
