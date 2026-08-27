import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ScanLine } from 'lucide-react';
import FileDrop from '../components/FileDrop';
import QuantityFieldPicker from '../components/QuantityFieldPicker';
import { Alert, Spinner } from '../components/ui/Feedback';
import { Field, Input, Select, Textarea, Checkbox } from '../components/ui/Field';
import { Button } from '../components/ui/Button';
import { Card, CardHead } from '../components/ui/Card';
import { api, money } from '../lib/api';
import type { GclPreview, Package, QuantitySource } from '../lib/types';

export default function UploadPage() {
  const [params] = useSearchParams();
  // The project is chosen in the dialog before this page opens.
  const externalSiteId = params.get('project');
  const nav = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<GclPreview | null>(null);
  const [busy, setBusy] = useState<'parse' | 'commit' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    quantityFieldKey: '',
    quantitySource: 'AS_BUILT' as QuantitySource,
    handoverDate: '',
    startDate: '',
    endDate: '',
    poValue: '',
    contractorPmId: '',
    tawalPmName: '',
    tawalPmId: '',
    overwrite: false,
  });

  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  async function parse(f: File) {
    setFile(f);
    setPreview(null);
    setError(null);
    setBusy('parse');
    try {
      const result = await api.upload<GclPreview>('/gcl/preview', f);
      setPreview(result);
      // Pre-select what the document suggests, but leave the choice open.
      if (result.suggestedFieldKey) set('quantityFieldKey', result.suggestedFieldKey);
      // The GCL date is the natural End Date; pre-fill so the form is one field lighter.
      if (result.gclDate) set('endDate', result.gclDate.slice(0, 10));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function commit() {
    if (!file) return;
    setBusy('commit');
    setError(null);
    try {
      const pkg = await api.upload<Package>('/gcl/upload', file, {
        ...form,
        ...(externalSiteId ? { externalSiteId } : {}),
      });
      nav(`/packages/${pkg.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const selectedTotal =
    preview?.quantityColumns.find((c) => c.key === form.quantityFieldKey)?.total ?? 0;

  // Reached without going through the project dialog.
  if (!externalSiteId) return <Navigate to="/gcl" replace />;

  return (
    <div className="space-y-6">
      {(
      <div>
        <h1 className="text-2xl font-bold tracking-tight gradient-text animate-gradient-pan">Upload a signed GCL</h1>
        <p className="mt-1 text-sm text-fg-muted">
          The item codes are matched against the Unit Price List, then the As-Built BOQ, Work Order
          and PAC are produced from the result.
        </p>
      </div>
      )}

      <FileDrop
        accept="application/pdf,.pdf"
        file={file}
        onFile={parse}
        hint="Handing Over GCL for Minor Scope — PDF with a text layer (not a flat scan)"
      />

      {busy === 'parse' && <Spinner label="Reading the GCL…" />}
      {error && <Alert kind="error" title="Something went wrong">{error}</Alert>}

      {preview && (
        <>
          {preview.warnings.length > 0 && (
            <Alert kind="warn" title="Read with warnings">
              <ul className="list-inside list-disc space-y-0.5">
                {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </Alert>
          )}

          {preview.unpricedItems.length > 0 && (
            <Alert kind="error" title="Missing from the price list">
              {preview.unpricedItems.join(', ')} — these will be priced at 0.00. Add them under
              Price List first, then re-upload or hit Re-price.
            </Alert>
          )}

          <div className="surface">
            <div className="surface-head">
              <h2 className="text-sm font-semibold text-fg">What was read</h2>
              <span className="text-xs text-fg-subtle">{preview.lines.length} line items</span>
            </div>

            <dl className="grid grid-cols-2 gap-x-8 gap-y-3 px-5 py-4 text-sm md:grid-cols-4">
              {[
                ['WO Number', preview.woNumber],
                ['Site No.', preview.siteNo],
                ['Tawal Site ID', preview.tawalSiteId],
                ['PO #', preview.poNumber],
                ['Region', preview.region],
                ['District', preview.district],
                ['Project', preview.projectName],
                ['GCL Date', preview.gclDate?.slice(0, 10)],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{k}</dt>
                  <dd className="mt-0.5 break-all font-medium text-fg">{v || '—'}</dd>
                </div>
              ))}
            </dl>

            <div className="overflow-x-auto border-t border-slate-100">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr>
                    <th className="th w-10">#</th>
                    <th className="th">Item Code</th>
                    <th className="th">Description</th>
                    {preview.quantityColumns.map((c) => (
                      <th key={c.key} className="th text-right">{c.label}</th>
                    ))}
                    <th className="th text-right">Unit Price</th>
                    <th className="th text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.lines.map((l) => (
                    <tr key={l.itemCode} className={l.priceFound ? '' : 'bg-rose-50 dark:bg-rose-500/10'}>
                      <td className="td">{l.no}</td>
                      <td className="td font-mono text-xs font-semibold text-orchid-brand dark:text-orchid-brand">{l.itemCode}</td>
                      <td className="td max-w-md truncate text-fg-muted" title={l.description}>
                        {l.description}
                      </td>
                      {preview.quantityColumns.map((c) => (
                        <td
                          key={c.key}
                          className={`td text-right ${
                            form.quantityFieldKey === c.key ? 'font-semibold text-fg' : ''
                          }`}
                        >
                          {(l.quantities[c.key] ?? 0).toFixed(2)}
                        </td>
                      ))}
                      <td className="td text-right">{l.priceFound ? money(l.unitPrice, '') : '—'}</td>
                      <td className="td text-right font-semibold">
                        {money(l.totals?.[form.quantityFieldKey] ?? 0, '')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ---- commit form ---- */}
          <div className="surface">
            <div className="surface-head">
              <h2 className="text-sm font-semibold text-fg">Details the GCL doesn't carry</h2>
            </div>

            <div className="space-y-5 px-5 py-5">
              <QuantityFieldPicker
                columns={preview.quantityColumns}
                value={form.quantityFieldKey}
                onChange={(k) => set('quantityFieldKey', k)}
              />

              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Handover Date" hint="Column on the Work Order form">
                  <Input type="date" value={form.handoverDate}
                         onChange={(e) => set('handoverDate', e.target.value)} />
                </Field>
                <Field label="Start Date">
                  <Input type="date" value={form.startDate}
                         onChange={(e) => set('startDate', e.target.value)} />
                </Field>
                <Field label="End Date" hint="Defaults to the GCL date">
                  <Input type="date" value={form.endDate}
                         onChange={(e) => set('endDate', e.target.value)} />
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <Field label="PO Value" hint="Optional; blank leaves the WO field empty">
                  <Input type="number" step="0.01" value={form.poValue}
                         onChange={(e) => set('poValue', e.target.value)} />
                </Field>
                <Field label="Contractor PM ID" hint="Printed on the PAC">
                  <Input placeholder="2328338328" value={form.contractorPmId}
                         onChange={(e) => set('contractorPmId', e.target.value)} />
                </Field>
                <Field label="Tawal PM Name">
                  <Input value={form.tawalPmName}
                         onChange={(e) => set('tawalPmName', e.target.value)} />
                </Field>
                <Field label="Tawal PM ID">
                  <Input value={form.tawalPmId}
                         onChange={(e) => set('tawalPmId', e.target.value)} />
                </Field>
              </div>

              <label className="flex items-center gap-2 text-sm text-fg-muted">
                <input type="checkbox" checked={form.overwrite}
                       onChange={(e) => set('overwrite', e.target.checked)}
                       className="h-4 w-4 rounded border-line" />
                Replace an existing package with the same WO number
              </label>
            </div>

            <div className="flex items-center justify-between border-t border-line px-5 py-4">
              <div className="text-sm text-fg-muted">
                Gross at selected quantities:{' '}
                <span className="font-semibold text-fg">{money(selectedTotal)}</span>
              </div>
              <Button variant="gradient" onClick={commit} disabled={busy !== null}>
                {busy === 'commit' ? <Spinner label="Creating…" /> : (<><ScanLine size={16} /> Create package <ArrowRight size={16} /></>)}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
