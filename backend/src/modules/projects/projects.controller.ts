import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../auth/permissions.guard';
import { UserRole } from '@prisma/client';
import { ProjectsService } from './projects.service';
import { CreateProjectDto, UpdateProjectDto } from './projects.dto';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@ApiTags('Projects')
@Controller('projects')
@UseGuards(RolesGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @RequirePermission('projects', 'view')
  @Get()
  findAll(@Query('includeInactive') inc?: string) {
    return this.projects.findAll(inc === 'true');
  }

  @RequirePermission('projects', 'view')
  @Get(':idOrSlug')
  findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.projects.findOne(idOrSlug);
  }

  @Post()
  @RequirePermission('projects', 'create')
  create(@Body() dto: CreateProjectDto) {
    return this.projects.create(dto);
  }

  @Patch(':id')
  @RequirePermission('projects', 'edit')
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('projects', 'delete')
  remove(@Param('id') id: string) {
    return this.projects.remove(id);
  }
}
