import { Global, Module } from '@nestjs/common';
import { ExternalProjectsController } from './external-projects.controller';
import { ExternalProjectsService } from './external-projects.service';

@Global()
@Module({
  controllers: [ExternalProjectsController],
  providers: [ExternalProjectsService],
  exports: [ExternalProjectsService],
})
export class ExternalProjectsModule {}
