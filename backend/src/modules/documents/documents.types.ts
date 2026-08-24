import { Prisma } from '@prisma/client';

export type PackageWithLines = Prisma.PackageGetPayload<{ include: { lines: true } }>;

export const DOCUMENT_LABELS: Record<string, string> = {
  GCL_PDF: 'Handing Over GCL (PDF)',
  BOQ_XLSX: 'As-Built BOQ (Excel)',
  BOQ_PDF: 'As-Built BOQ (PDF)',
  WO_XLSX: 'Work Order (Excel)',
  WO_PDF: 'Work Order (PDF)',
  PAC_PDF: 'Preliminary Acceptance Certificate (PDF)',
  BUNDLE_ZIP: 'Full package (ZIP)',
};
