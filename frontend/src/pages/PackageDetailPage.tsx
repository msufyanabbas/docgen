import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Download, FileSignature, FileSpreadsheet, FileText,
  Package as PackageIcon, RefreshCw, Save, Upload,
} from 'lucide-react';
import { Alert, Spinner } from '../components/ui/Feedback';
import { Field, Input, Select } from '../components/ui/Field';
import { Button } from '../components/ui/Button';
import { Card, CardHead } from '../components/ui/Card';
import { StatusBadge, Badge } from '../components/ui/Badge';
import { api, dateInput, money, shortDate } from '../lib/api';
import Pipeline from '../components/Pipeline';
import SignatureInput from '../components/SignatureInput';
import type { DocumentType, Package, QuantitySource } from '../lib/types';

const DOCS: { type: DocumentType; label: string; icon: typeof FileText }[] = [
  { type: 'GCL_PDF', label: 'Handing Over GCL · PDF', icon: FileSignature },
  { type: 'BOQ_XLSX', label: 'As-Built BOQ · Excel', icon: FileSpreadsheet },
  { type: 'BOQ_PDF', label: 'As-Built BOQ · PDF', icon: FileText },
  { type: 'WO_XLSX', label: 'Work Order · Excel', icon: FileSpreadsheet },
  { type: 'WO_PDF', label: 'Work Order · PDF', icon: FileText },
  { type: 'PAC_PDF', label: 'PAC · PDF', icon: FileText },
];

export default function PackageDetailPage() {
  const { id = '' } = useParams();
  const [pkg, setPkg] = useState<Package | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pendingSignature, setPendingSignature] = useState<File | null>(null);

  const load = useCallback(async () => {
    try {
      setPkg(await api.get<Package>(`/packages/${id}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const patch = (changes: Partial<Package>) => {
    setPkg((p) => (p ? { ...p, ...changes } : p));
    setDirty(true);
  };

  const patchLine = (lineId: string, changes: Record<string, string>) => {
    setPkg((p) =>
      p ? { ...p, lines: p.lines.map((l) => (l.id === lineId ? { ...l, ...changes } : l)) } : p,
    );
    setDirty(true);
  };

  async function save() {
    if (!pkg) return;
    setBusy('save');
    setError(null);
    try {
      const body = {
        quantitySource: pkg.quantitySource,
        quantityFieldKey: pkg.quantityFieldKey ?? undefined,
        siteNo: pkg.siteNo,
        region: pkg.region ?? undefined,
        district: pkg.district ?? undefined,
        projectName: pkg.projectName,
        contractorName: pkg.contractorName,
        poNumber: pkg.poNumber ?? undefined,
        poValue: pkg.poValue ? Number(pkg.poValue) : undefined,
        discount: Number(pkg.discount),
        foc: Number(pkg.foc),
        handoverDate: pkg.handoverDate ?? undefined,
        startDate: pkg.startDate ?? undefined,
        endDate: pkg.endDate ?? undefined,
        contractorPmName: pkg.contractorPmName ?? undefined,
        contractorPmId: pkg.contractorPmId ?? undefined,
        tawalPmName: pkg.tawalPmName ?? undefined,
        tawalPmId: pkg.tawalPmId ?? undefined,
        lines: pkg.lines.map((l) => ({
          id: l.id,
          tagNumber: l.tagNumber,
          serialNumber: l.serialNumber ?? undefined,
          designQty: Number(l.designQty),
          asBuiltQty: Number(l.asBuiltQty),
        })),
      };
      setPkg(await api.send<Package>(`/packages/${id}`, 'PATCH', body));
      setDirty(false);
      setNotice('Saved and re-priced.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function uploadSignature(file: File) {
    setBusy('signature');
    setError(null);
    try {
      const fd = new FormData();
      fd.append('signature', file);
      await api.uploadForm(`/packages/${id}/signature`, fd);
      await load();
      setNotice('Signature updated. Regenerate the GCL to apply it.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function generate() {
    setBusy('generate');
    setError(null);
    try {
      const res = await api.send<{ warnings: string[] }>(`/packages/${id}/documents/generate`, 'POST', {});
      await load();
      setNotice(res.warnings.length ? res.warnings.join(' ') : 'All five documents generated.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (error && !pkg) return <Alert kind="error">{error}</Alert>;
  if (!pkg) return <Spinner label="Loading package…" />;

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-lg font-bold text-fg">{pkg.siteNo}</h1>
            <StatusBadge status={pkg.status} />
            <span className="chip bg-line/50 text-fg-muted">
              {pkg.origin === 'SCOPE_SHEET' ? 'From scope sheet' : 'From signed GCL'}
            </span>
            {pkg.quantityFieldLabel && (
              <span className="chip bg-cyan-brand/15 text-cyan-brand">
                priced on {pkg.quantityFieldLabel}
              </span>
            )}
          </div>
          <p className="mt-1 break-all font-mono text-xs text-fg-muted">{pkg.woNumber}</p>
          {pkg.siteName && <p className="text-xs text-fg-subtle">{pkg.siteName}</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="" onClick={save} disabled={busy !== null || !dirty}>
            <Save size={15} /> Save &amp; re-price
          </Button>
          <Button variant="gradient" onClick={generate} disabled={busy !== null}>
            {busy === 'generate' ? <Spinner label="Generating…" /> : (<><RefreshCw size={15} /> Generate documents</>)}
          </Button>
          <Button
            variant="primary"
            onClick={() => api.download(`/packages/${id}/bundle`, 'package.zip')}
          >
            <PackageIcon size={15} /> Download all (.zip)
          </Button>
        </div>
      </div>

      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}
      {pkg.parseWarnings?.length ? (
        <Alert kind="warn" title="Parser warnings from the source GCL">
          <ul className="list-inside list-disc">{pkg.parseWarnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </Alert>
      ) : null}

      <Pipeline done={(pkg.documents ?? []).map((d) => d.type)} />

      {/* totals strip */}
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ['Gross', pkg.grossAmount],
          ['Discount', pkg.discount],
          ['FOC', pkg.foc],
          ['Net', pkg.netAmount],
        ].map(([label, value], i) => (
          <div key={label as string} className={`card px-4 py-3 ${i === 3 ? 'ring-1 ring-cyan-brand' : ''}`}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{label}</div>
            <div className="mt-1 text-lg font-bold text-fg">{money(value as string, pkg.currency)}</div>
          </div>
        ))}
      </div>

      {/* header fields */}
      <div className="surface">
        <div className="surface-head"><h2 className="text-sm font-semibold text-fg">Package details</h2></div>
        <div className="grid gap-4 px-4 py-5 sm:px-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Quantity source">
            <Select value={pkg.quantitySource}
                    onChange={(e) => patch({ quantitySource: e.target.value as QuantitySource })}>
              <option value="AS_BUILT">As-Built QTY</option>
              <option value="DESIGN">Design QTY</option>
            </Select>
          </Field>
          <Field label="Region"><Input value={pkg.region ?? ''} onChange={(e) => patch({ region: e.target.value })} /></Field>
          <Field label="District"><Input value={pkg.district ?? ''} onChange={(e) => patch({ district: e.target.value })} /></Field>
          <Field label="PO #"><Input value={pkg.poNumber ?? ''} onChange={(e) => patch({ poNumber: e.target.value })} /></Field>

          <Field label="Handover Date">
            <Input type="date" value={dateInput(pkg.handoverDate)}
                   onChange={(e) => patch({ handoverDate: e.target.value || null })} />
          </Field>
          <Field label="Start Date">
            <Input type="date" value={dateInput(pkg.startDate)}
                   onChange={(e) => patch({ startDate: e.target.value || null })} />
          </Field>
          <Field label="End Date">
            <Input type="date" value={dateInput(pkg.endDate)}
                   onChange={(e) => patch({ endDate: e.target.value || null })} />
          </Field>
          <Field label="PO Value">
            <Input type="number" step="0.01" value={pkg.poValue ?? ''}
                   onChange={(e) => patch({ poValue: e.target.value })} />
          </Field>

          <Field label="Contractor PM"><Input value={pkg.contractorPmName ?? ''} onChange={(e) => patch({ contractorPmName: e.target.value })} /></Field>
          <Field label="Contractor PM ID"><Input value={pkg.contractorPmId ?? ''} onChange={(e) => patch({ contractorPmId: e.target.value })} /></Field>
          <Field label="Tawal PM"><Input value={pkg.tawalPmName ?? ''} onChange={(e) => patch({ tawalPmName: e.target.value })} /></Field>
          <Field label="Tawal PM ID"><Input value={pkg.tawalPmId ?? ''} onChange={(e) => patch({ tawalPmId: e.target.value })} /></Field>

          <Field label="Discount"><Input type="number" step="0.01" value={pkg.discount} onChange={(e) => patch({ discount: e.target.value })} /></Field>
          <Field label="FOC"><Input type="number" step="0.01" value={pkg.foc} onChange={(e) => patch({ foc: e.target.value })} /></Field>
        </div>
      </div>

      {/* lines */}
      <div className="surface">
        <div className="surface-head">
          <h2 className="text-sm font-semibold text-fg">BOQ lines</h2>
          <span className="text-xs text-fg-subtle">TAG # comes from Tawal's asset registry — fill it in here</span>
        </div>
        <div className="-mx-px overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr>
                <th className="th w-10">#</th>
                <th className="th">Item Code</th>
                <th className="th">Description</th>
                <th className="th w-24 text-right">Design</th>
                <th className="th w-24 text-right">As-Built</th>
                <th className="th w-32">TAG #</th>
                <th className="th w-36">Serial</th>
                <th className="th w-28 text-right">Unit Price</th>
                <th className="th w-32 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {pkg.lines.map((l) => (
                <tr key={l.id} className={l.priceFound ? '' : 'bg-rose-50 dark:bg-rose-500/10'}>
                  <td className="td">{l.no}</td>
                  <td className="td whitespace-nowrap font-mono text-xs font-semibold text-orchid-brand dark:text-orchid-brand">{l.itemCode}</td>
                  <td className="td max-w-xs truncate text-fg-muted" title={l.description}>{l.description}</td>
                  <td className="td">
                    <input type="number" step="0.01" value={l.designQty}
                           onChange={(e) => patchLine(l.id, { designQty: e.target.value })}
                           className="w-full rounded border border-line px-2 py-1 text-right text-sm" />
                  </td>
                  <td className="td">
                    <input type="number" step="0.01" value={l.asBuiltQty}
                           onChange={(e) => patchLine(l.id, { asBuiltQty: e.target.value })}
                           className="w-full rounded border border-line px-2 py-1 text-right text-sm font-semibold" />
                  </td>
                  <td className="td">
                    <input value={l.tagNumber}
                           onChange={(e) => patchLine(l.id, { tagNumber: e.target.value })}
                           className="w-full rounded border border-line px-2 py-1 text-sm" />
                  </td>
                  <td className="td">
                    <input value={l.serialNumber ?? ''}
                           onChange={(e) => patchLine(l.id, { serialNumber: e.target.value })}
                           className="w-full rounded border border-line px-2 py-1 font-mono text-xs" />
                  </td>
                  <td className="td text-right">{money(l.unitPrice, '')}</td>
                  <td className="td text-right font-semibold">{money(l.lineTotal, '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* signature */}
      <div className="surface">
        <div className="surface-head">
          <h2 className="text-sm font-semibold text-fg">GCL signature</h2>
          <span className="text-xs text-fg-subtle">
            {pkg.signatureFileName
              ? `Current: ${pkg.signatureFileName}`
              : 'None attached yet'}
          </span>
        </div>

        <div className="grid gap-5 px-4 py-5 sm:px-5 lg:grid-cols-[1.15fr_1fr]">
          <SignatureInput onChange={setPendingSignature} />

          <div className="flex flex-col justify-between gap-4">
            <div className="surface flex items-center gap-4 px-4 py-4">
              <img
                src="/brand/company-stamp.png"
                alt="Smart Life stamp"
                className="h-20 w-20 shrink-0 object-contain"
              />
              <div className="text-xs leading-relaxed text-fg-muted">
                The company stamp is applied automatically. Only the signature changes per package.
              </div>
            </div>

            <Button
              variant="gradient"
              onClick={() => pendingSignature && uploadSignature(pendingSignature)}
              disabled={!pendingSignature || busy !== null}
              loading={busy === 'signature'}
            >
              <Upload size={15} />
              {pkg.signatureFileName ? 'Replace signature' : 'Save signature'}
            </Button>
          </div>
        </div>
      </div>

      {/* documents */}
      <div className="surface">
        <div className="surface-head"><h2 className="text-sm font-semibold text-fg">Documents</h2></div>
        <div className="divide-y divide-line/60">
          {DOCS.map(({ type, label, icon: Icon }) => {
            const doc = pkg.documents?.find((d) => d.type === type);
            return (
              <div key={type} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <Icon size={17} className="text-fg-subtle" />
                  <div>
                    <div className="text-sm font-medium text-fg">{label}</div>
                    <div className="text-[11px] text-fg-subtle">
                      {doc ? `${doc.fileName} · ${(doc.sizeBytes / 1024).toFixed(0)} KB · ${shortDate(doc.createdAt)}` : 'Not generated yet'}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      type.endsWith('PDF')
                        ? api.openInline(`/packages/${id}/documents/${type}/preview`)
                        : api.download(`/packages/${id}/documents/${type}/preview`, label)
                    }
                  >
                    Live preview
                  </Button>
                  {doc && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => api.download(`/documents/${doc.id}/download`, doc.fileName)}
                    >
                      <Download size={13} /> Download
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {pkg.notes && (
        <div className="surface px-5 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">GCL remarks</div>
          <p className="mt-1 whitespace-pre-line text-sm text-fg-muted">{pkg.notes}</p>
        </div>
      )}
    </div>
  );
}
