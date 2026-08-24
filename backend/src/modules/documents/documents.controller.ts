import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { DocumentType } from '@prisma/client';
import { DocumentsService } from './documents.service';
import { GenerateDocumentsDto } from './documents.dto';
import { StorageService } from '../storage/storage.service';
import { DOCUMENT_LABELS } from './documents.types';
import { GclBuilderService } from '../gcl/gcl-builder.service';

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.zip': 'application/zip',
};

function mimeFor(fileName: string) {
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  return MIME[ext] ?? 'application/octet-stream';
}

/** RFC 5987 filename so Arabic/spaces in a site name never break the download. */
function disposition(fileName: string, inline: boolean) {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

@ApiTags('Documents')
@Controller()
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly storage: StorageService,
    private readonly builder: GclBuilderService,
  ) {}

  /** Attach or replace the contractor signature used on the GCL. */
  @Post('packages/:id/signature')
  @UseInterceptors(FileInterceptor('signature', { limits: { fileSize: 5 * 1024 * 1024 } }))
  signature(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No image uploaded (field name must be "signature").');
    return this.builder.setSignature(id, file);
  }

  @Get('documents/types')
  types() {
    return Object.entries(DOCUMENT_LABELS).map(([value, label]) => ({ value, label }));
  }

  @Post('packages/:id/documents/generate')
  generate(@Param('id') id: string, @Body() dto: GenerateDocumentsDto) {
    return this.documents.generate(id, dto.types);
  }

  @Get('packages/:id/documents')
  list(@Param('id') id: string) {
    return this.documents.listDocuments(id);
  }

  /** Live render — always reflects the current package state, nothing cached. */
  @Get('packages/:id/documents/:type/preview')
  async preview(
    @Param('id') id: string,
    @Param('type') type: DocumentType,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { fileName, buffer } = await this.documents.buildInline(id, type);
    res.set({
      'Content-Type': mimeFor(fileName),
      'Content-Disposition': disposition(fileName, fileName.endsWith('.pdf')),
      'Content-Length': String(buffer.length),
    });
    return new StreamableFile(buffer);
  }

  @Get('packages/:id/bundle')
  async bundle(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const { fileName, buffer } = await this.documents.bundle(id);
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': disposition(fileName, false),
      'Content-Length': String(buffer.length),
    });
    return new StreamableFile(buffer);
  }

  @Get('documents/:documentId/download')
  async download(
    @Param('documentId') documentId: string,
    @Query('inline') inline: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const doc = await this.documents.getFile(documentId);
    res.set({
      'Content-Type': mimeFor(doc.fileName),
      'Content-Disposition': disposition(doc.fileName, inline === 'true'),
      'Content-Length': String(doc.sizeBytes),
    });
    return new StreamableFile(this.storage.stream(doc.path));
  }
}
