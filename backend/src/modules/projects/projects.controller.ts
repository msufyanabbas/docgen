import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ProjectsService } from './projects.service';
import { CreateMobDto, CreateProjectDto, UpdateMobDto, UpdateProjectDto } from './projects.dto';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@ApiTags('Projects')
@Controller('projects')
@UseGuards(RolesGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  // --- readable by any signed-in user ---

  @Get()
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.projects.findAll(includeInactive === 'true');
  }

  @Get('types')
  types() {
    return this.projects.types();
  }

  @Get('templates')
  templates() {
    return this.projects.templates();
  }

  @Get(':id/available-mobs')
  availableMobs(@Param('id') id: string) {
    return this.projects.availableMobTypes(id);
  }

  @Get(':idOrSlug')
  findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.projects.findOne(idOrSlug);
  }

  // --- structural changes are Admin-only ---

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateProjectDto) {
    return this.projects.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.projects.remove(id);
  }

  @Post(':id/mobs')
  @Roles(UserRole.ADMIN)
  addMob(@Param('id') id: string, @Body() dto: CreateMobDto) {
    return this.projects.addMob(id, dto);
  }

  @Patch('mobs/:mobId')
  @Roles(UserRole.ADMIN)
  updateMob(@Param('mobId') mobId: string, @Body() dto: UpdateMobDto) {
    return this.projects.updateMob(mobId, dto);
  }

  @Delete('mobs/:mobId')
  @Roles(UserRole.ADMIN)
  removeMob(@Param('mobId') mobId: string) {
    return this.projects.removeMob(mobId);
  }
}
