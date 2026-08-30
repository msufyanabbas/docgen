import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../auth/permissions.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ProjectsService } from './projects.service';

/** Read-only: the tracker owns projects, so there is nothing to write here. */
@ApiTags('Projects')
@Controller('projects')
@UseGuards(RolesGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @RequirePermission('projects', 'view')
  findAll() {
    return this.projects.findAll();
  }

  @Get(':siteId')
  @RequirePermission('projects', 'view')
  findOne(@Param('siteId') siteId: string) {
    return this.projects.findOne(siteId);
  }
}
