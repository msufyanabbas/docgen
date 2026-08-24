import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { PdfRenderer } from './generators/pdf.renderer';
import { BoqExcelGenerator } from './generators/boq-excel.generator';
import { WoExcelGenerator } from './generators/wo-excel.generator';
import { GclModule } from '../gcl/gcl.module';

@Module({
  imports: [GclModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, PdfRenderer, BoqExcelGenerator, WoExcelGenerator],
  exports: [DocumentsService],
})
export class DocumentsModule {}
