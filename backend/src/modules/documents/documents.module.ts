import { Module, forwardRef } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { PdfRenderer } from './generators/pdf.renderer';
import { CertExcelGenerator } from './generators/cert-excel.generator';
import { BoqExcelGenerator } from './generators/boq-excel.generator';
import { WoExcelGenerator } from './generators/wo-excel.generator';
import { GclModule } from '../gcl/gcl.module';

@Module({
  imports: [forwardRef(() => GclModule)],
  controllers: [DocumentsController],
  providers: [DocumentsService, PdfRenderer,
    CertExcelGenerator, BoqExcelGenerator, WoExcelGenerator],
  exports: [DocumentsService],
})
export class DocumentsModule {}
