import { BadRequestException, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ExternalProjectsService, GclStage } from './external-projects.service';

@ApiTags('External projects')
@Controller('external-projects')
export class ExternalProjectsController {
  constructor(private readonly projects: ExternalProjectsService) {}

  @Get()
  list(@Query('stage') stage?: string) {
    if (stage && stage !== 'create' && stage !== 'upload') {
      throw new BadRequestException('stage must be "create" or "upload"');
    }
    return this.projects.list(stage as GclStage | undefined);
  }

  @Post('refresh')
  refresh() {
    this.projects.invalidate();
    return this.projects.list();
  }
}
