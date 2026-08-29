import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../auth/permissions.guard';
import { GclService } from './gcl.service';
import { GclBuilderService } from './gcl-builder.service';
import { CreateFromGclDto } from '../packages/packages.dto';
import { CreateGclDto } from './gcl.dto';

@ApiTags('GCL')
@Controller('gcl')
export class GclController {
  constructor(
    private readonly gcl: GclService,
    private readonly builder: GclBuilderService,
  ) {}

  /** Parse only — a dry run used by the upload screen to preview before committing. */
  @Post('preview')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  preview(@UploadedFile() file: Express.Multer.File) {
    this.assertPdf(file);
    return this.gcl.preview(file.buffer);
  }

  /** Parse, price against the UPL and persist as a package. */
  @RequirePermission('gcl', 'create')
  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  upload(@UploadedFile() file: Express.Multer.File, @Body() dto: CreateFromGclDto) {
    this.assertPdf(file);
    return this.gcl.ingest(file.buffer, file.originalname, dto);
  }

  /* ---------------- creating a GCL from a scope-of-work sheet ---------------- */

  /** Dry run over a scope sheet (e.g. ZMS008.xlsx): sites, items and pricing. */
  @Post('scope/preview')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  previewScope(@UploadedFile() file: Express.Multer.File, @Body('uplVersion') uplVersion?: string) {
    this.assertWorkbook(file);
    return this.builder.previewScope(file.buffer, uplVersion || 'v1');
  }

  /**
   * Creates a package per site from the scope sheet, ready for GCL_PDF generation.
   * Two file fields: `file` (the scope workbook) and optional `signature` (PNG/JPEG).
   */
  @RequirePermission('gcl', 'create')
  @Post('scope/create')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'file', maxCount: 1 },
        { name: 'signature', maxCount: 1 },
      ],
      { limits: { fileSize: 25 * 1024 * 1024 } },
    ),
  )
  createFromScope(
    @UploadedFiles() files: { file?: Express.Multer.File[]; signature?: Express.Multer.File[] },
    @Body() dto: CreateGclDto,
  ) {
    const scope = files?.file?.[0];
    this.assertWorkbook(scope);
    return this.gcl.createFromScope(scope, files?.signature?.[0], dto);
  }

  private assertWorkbook(file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No scope sheet uploaded (field name must be "file").');
    if (!/\.xlsx?$/i.test(file.originalname)) {
      throw new BadRequestException('The scope of work must be an .xlsx or .xls workbook.');
    }
  }

  private assertPdf(file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded (field name must be "file").');
    if (!/\.pdf$/i.test(file.originalname) && file.mimetype !== 'application/pdf') {
      throw new BadRequestException('The GCL must be a PDF.');
    }
  }
}
