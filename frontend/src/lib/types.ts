export type QuantitySource = 'DESIGN' | 'AS_BUILT';
export type PackageStatus = 'DRAFT' | 'READY' | 'GENERATED';
export type PackageOrigin = 'GCL_UPLOAD' | 'SCOPE_SHEET';
export type DocumentType =
  | 'GCL_PDF'
  | 'BOQ_XLSX' | 'BOQ_PDF' | 'WO_XLSX' | 'WO_PDF' | 'PAC_PDF' | 'BUNDLE_ZIP';

export interface PreviewLine {
  no: number;
  itemCode: string;
  description: string;
  unit: string | null;
  designQty: number;
  asBuiltQty: number;
  itemType: string | null;
  serialNumber: string | null;
  unitPrice: number;
  priceFound: boolean;
  designTotal: number;
  asBuiltTotal: number;
}

export interface GclPreview {
  woNumber: string | null;
  siteNo: string | null;
  tawalSiteId: string | null;
  region: string | null;
  district: string | null;
  projectName: string | null;
  poNumber: string | null;
  gclDate: string | null;
  contractorPmName: string | null;
  mspRepName: string | null;
  notes: string | null;
  lines: PreviewLine[];
  warnings: string[];
  totals: { design: number; asBuilt: number };
  unpricedItems: string[];
}

export interface PackageLine {
  id: string;
  no: number;
  itemCode: string;
  description: string;
  unit: string | null;
  itemType: string | null;
  designQty: string;
  asBuiltQty: string;
  quantity: string;
  serialNumber: string | null;
  tagNumber: string;
  serviceDate: string | null;
  unitPrice: string;
  lineTotal: string;
  priceFound: boolean;
}

export interface GeneratedDocument {
  id: string;
  type: DocumentType;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
}

export interface ScopeLine {
  no: number;
  itemCode: string;
  description: string;
  unit: string | null;
  qty: number;
  workType: string | null;
  itemType: 'Tangible' | 'Service' | null;
  unitPrice: number;
  priceFound: boolean;
  lineTotal: number;
}

export interface ScopeSite {
  budget: string | null;
  subProjectName: string | null;
  contractor: string | null;
  poNumber: string | null;
  tawalSiteId: string | null;
  siteCode: string | null;
  siteName: string | null;
  lines: ScopeLine[];
  total: number;
  unpricedItems: string[];
}

export interface ScopePreview {
  sites: ScopeSite[];
  warnings: string[];
}

export interface Package {
  id: string;
  status: PackageStatus;
  origin: PackageOrigin;
  siteName: string | null;
  signatureFileName: string | null;
  mspSignDate: string | null;
  quantitySource: QuantitySource;
  uplVersion: string;
  woNumber: string;
  siteNo: string;
  tawalSiteId: string | null;
  region: string | null;
  district: string | null;
  projectName: string;
  contractorName: string;
  poNumber: string | null;
  poValue: string | null;
  gclDate: string | null;
  serviceDate: string | null;
  handoverDate: string | null;
  startDate: string | null;
  endDate: string | null;
  contractorPmName: string | null;
  contractorPmId: string | null;
  mspRepName: string | null;
  tawalPmName: string | null;
  tawalPmId: string | null;
  currency: string;
  grossAmount: string;
  discount: string;
  foc: string;
  netAmount: string;
  notes: string | null;
  parseWarnings: string[] | null;
  createdAt: string;
  lines: PackageLine[];
  documents?: GeneratedDocument[];
  _count?: { lines: number; documents: number };
}

export interface UplItem {
  id: string;
  version: string;
  line: number | null;
  itemCode: string;
  description: string;
  categoryName: string | null;
  uom: string | null;
  price: string;
  currency: string;
  isActive: boolean;
}

export interface Paged<T> { items: T[]; total: number; page: number; limit: number }
