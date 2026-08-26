import { Module } from '@nestjs/common';
import { MopController } from './mop.controller';
import { MopService } from './mop.service';
import { DocxToPdfService } from './docx-to-pdf.service';

@Module({
  controllers: [MopController],
  providers: [MopService, DocxToPdfService],
  exports: [MopService, DocxToPdfService],
})
export class MopModule {}
