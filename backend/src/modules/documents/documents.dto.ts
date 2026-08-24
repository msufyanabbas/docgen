import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsOptional } from 'class-validator';
import { DocumentType } from '@prisma/client';

export class GenerateDocumentsDto {
  /** Omit to generate the full set (BOQ xlsx+pdf, WO xlsx+pdf, PAC pdf). */
  @IsOptional()
  @IsArray()
  @IsEnum(DocumentType, { each: true })
  @Type(() => String)
  types?: DocumentType[];
}
