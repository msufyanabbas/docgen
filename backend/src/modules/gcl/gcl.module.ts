import { Module, forwardRef } from '@nestjs/common';
import { GclController } from './gcl.controller';
import { GclService } from './gcl.service';
import { GclBuilderService } from './gcl-builder.service';
import { PackagesModule } from '../packages/packages.module';
import { UplModule } from '../upl/upl.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [PackagesModule, UplModule, forwardRef(() => DocumentsModule)],
  controllers: [GclController],
  providers: [GclService, GclBuilderService],
  exports: [GclBuilderService],
})
export class GclModule {}
