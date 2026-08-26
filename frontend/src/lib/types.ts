export type QuantitySource = 'DESIGN' | 'AS_BUILT';
export type PackageStatus = 'DRAFT' | 'READY' | 'GENERATED';
export type PackageOrigin = 'GCL_UPLOAD' | 'SCOPE_SHEET';
export type DocumentType =
  | 'GCL_PDF'
  | 'BOQ_XLSX' | 'BOQ_PDF' | 'WO_XLSX' | 'WO_PDF' | 'PAC_PDF' | 'BUNDLE_ZIP';

/** A numeric column found in the uploaded document, with what it would cost. */
export interface QuantityColumn {
  key: string;
  label: string;
  total: number;
  quantity: number;
}

export interface PreviewLine {
  no: number;
  itemCode: string;
  description: string;
  unit: string | null;
  quantities: Record<string, number>;
  totals: Record<string, number>;
  designQty: number;
  asBuiltQty: number;
  itemType: string | null;
  serialNumber: string | null;
  unitPrice: number;
  priceFound: boolean;
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
  quantityColumns: QuantityColumn[];
  suggestedFieldKey: string | null;
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
  quantities: Record<string, number>;
  totals?: Record<string, number>;
  workType: string | null;
  itemType: 'Tangible' | 'Service' | null;
  unitPrice: number;
  priceFound: boolean;
  lineTotal: number;
}

export interface ScopeSite {
  columnTotals?: Record<string, number>;
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
  quantityColumns: { key: string; label: string }[];
  suggestedFieldKey: string | null;
  warnings: string[];
}

export interface Package {
  id: string;
  status: PackageStatus;
  origin: PackageOrigin;
  quantityFieldKey: string | null;
  quantityFieldLabel: string | null;
  quantityFields: { key: string; label: string }[] | null;
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


/* ------------------------------------------------------------------ auth */

export type UserRole = 'ADMIN' | 'PM';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  mustChangePassword: boolean;
  isActive?: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
  createdBy?: { id: string; name: string } | null;
}

/* -------------------------------------------------------- projects / MOP */

export type MobTypeKey = 'SURVEY' | 'INSTALLATION' | 'PAT';
export type ProjectTypeKey = 'RMS' | 'CCTV' | 'SIM_SWAP' | 'SMART_LOCKS';

export interface MobTypeDefinition {
  key: MobTypeKey;
  name: string;
  templateKey: string;
  defaultTcnSummary: string;
  sortOrder: number;
}

export interface ProjectTypeDefinition {
  key: ProjectTypeKey;
  label: string;
  description: string;
  colour: string;
  mobTypes: MobTypeDefinition[];
}

export interface Mob {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  mobType: MobTypeKey;
  templateKey: string;
  defaultTcnSummary: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  type: ProjectTypeKey;
  description: string | null;
  colour: string | null;
  isActive: boolean;
  sortOrder: number;
  mobs: Mob[];
  _count?: { documents: number };
}

export interface TemplateInfo {
  key: string;
  label: string;
  file: string;
}

export type SiteImpact = 'NO' | 'YES';

export interface MopDocument {
  id: string;
  projectId: string;
  mobId: string;
  tcnSummary: string;
  siteId: string;
  requesterName: string;
  pmName: string;
  siteImpact: SiteImpact;
  siteImpactNote: string | null;
  docxFileName: string | null;
  pdfFileName: string | null;
  batchId: string | null;
  createdAt: string;
  project?: { id: string; name: string; slug: string; colour?: string | null };
  mob?: { id: string; name: string; slug?: string };
  createdBy?: { id: string; name: string } | null;
}

export interface MopBatch {
  id: string;
  fileName: string;
  total: number;
  succeeded: number;
  failed: number;
  errors?: { row: number; siteId: string; message: string }[] | null;
  createdAt: string;
  createdBy?: { id: string; name: string } | null;
  _count?: { documents: number };
}
