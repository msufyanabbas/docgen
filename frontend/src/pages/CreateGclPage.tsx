import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, FileSignature, PenLine } from 'lucide-react';
import FileDrop from '../components/FileDrop';
import SignatureInput from '../components/SignatureInput';
import QuantityFieldPicker from '../components/QuantityFieldPicker';
import { Alert, Spinner } from '../components/ui/Feedback';
import { Field, Input, Select, Textarea, Checkbox } from '../components/ui/Field';
import { Button } from '../components/ui/Button';
import { Card, CardHead } from '../components/ui/Card';
import { api, money } from '../lib/api';
import type { Package, QuantitySource, ScopePreview } from '../lib/types';

export default function CreateGclPage() {
  const nav = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ScopePreview | null>(null);
  const [signature, setSignature] = useState<File | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<'parse' | 'create' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    region: '',
    district: '',
    gclDate: today,
    contractorPmName: '',
    contractorPmId: '',
    mspRepName: '',
    mspSignDate: '',
    quantityFieldKey: '',
    quantitySource: 'AS_BUILT' as QuantitySource,
    notes: '',
    overwrite: false,
  });

  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const siteKey = (s: ScopePreview['sites'][number]) => s.siteCode ?? s.tawalSiteId ?? '';

  const chosen = useMemo(
    () => preview?.sites.filter((s) => selected.includes(siteKey(s))) ?? [],
    [preview, selected],
  );

  async function parse(f: File) {
    setFile(f);
    setPreview(null);
    setError(null);
    setBusy('parse');
    try {
      const result = await api.upload<ScopePreview>('/gcl/scope/preview', f);
      setPreview(result);
      setSelected(result.sites.map(siteKey)); // everything selected by default
      if (result.suggestedFieldKey) set('quantityFieldKey', result.suggestedFieldKey);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    if (!file) return;
    setBusy('create');
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (signature) fd.append('signature', signature);
      fd.append('siteCodes', JSON.stringify(selected));
      Object.entries(form).forEach(([k, v]) => {
        if (v !== '' && v != null) fd.append(k, String(v));
      });

      const res = await fetch('/api/gcl/scope/create', { method: 'POST', body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          Array.isArray(body.message) ? body.message.join(', ') : body.message || 'Create failed',
        );
      }
      const { packages } = (await res.json()) as { packages: Package[] };
      nav(`/packages/${packages[0].id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const total = form.quantityFieldKey
    ? chosen.reduce((a, s) => a + (s.columnTotals?.[form.quantityFieldKey] ?? 0), 0)
    : chosen.reduce((a, s) => a + s.total, 0);
  const unpriced = [...new Set(chosen.flatMap((s) => s.unpricedItems))];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight gradient-text animate-gradient-pan">Create a GCL</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Upload the approved scope of work and the system builds the Handing Over GCL, ready to
          print and sign. The company stamp is applied automatically; the signature is yours to
          supply.
        </p>
      </div>

      <FileDrop
        tour="dropzone"
        accept=".xlsx,.xls"
        file={file}
        onFile={parse}
        hint="Scope of work sheet — Site Code, Item Code, Unit and updated Qty per row"
      />

      {busy === 'parse' && <Spinner label="Reading the scope sheet…" />}
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

          {unpriced.length > 0 && (
            <Alert kind="error" title="Missing from the price list">
              {unpriced.join(', ')} — the GCL itself carries no prices, so it will still be correct,
              but the BOQ and Work Order would bill these at 0.00.
            </Alert>
          )}

          {/* ---- sites ---- */}
          <div className="surface">
            <div className="surface-head">
              <h2 className="text-sm font-semibold text-fg">
                Sites in this sheet ({preview.sites.length})
              </h2>
              <span className="text-xs text-fg-subtle">One GCL per selected site</span>
            </div>

            <div className="divide-y divide-line/60">
              {preview.sites.map((s) => {
                const key = siteKey(s);
                const on = selected.includes(key);
                return (
                  <div key={key} className="px-5 py-4">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) =>
                          setSelected((prev) =>
                            e.target.checked ? [...prev, key] : prev.filter((k) => k !== key),
                          )
                        }
                        className="mt-1 h-4 w-4 rounded border-line"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-3">
                          <span className="font-mono text-sm font-semibold text-fg">{s.siteCode}</span>
                          <span className="text-sm text-fg-muted">{s.siteName}</span>
                          <span className="text-xs text-fg-subtle">
                            Tawal ID {s.tawalSiteId} · PO {s.poNumber} · {s.lines.length} items
                          </span>
                          <span className="ml-auto text-sm font-semibold text-fg">
                            {money(s.total)}
                          </span>
                        </div>

                        {on && (
                          <div className="mt-3 overflow-x-auto rounded-lg border border-line">
                            <table className="w-full">
                              <thead>
                                <tr>
                                  <th className="th w-10">#</th>
                                  <th className="th w-36">Item Code</th>
                                  <th className="th">Description</th>
                                  <th className="th w-16">Unit</th>
                                  <th className="th w-20 text-right">Qty</th>
                                  <th className="th w-24">Type</th>
                                  <th className="th w-28 text-right">Unit Price</th>
                                </tr>
                              </thead>
                              <tbody>
                                {s.lines.map((l) => (
                                  <tr key={l.itemCode} className={l.priceFound ? '' : 'bg-rose-50 dark:bg-rose-500/10'}>
                                    <td className="td">{l.no}</td>
                                    <td className="td font-mono text-xs font-semibold text-orchid-brand dark:text-orchid-brand">{l.itemCode}</td>
                                    <td className="td max-w-md truncate text-fg-muted" title={l.description}>
                                      {l.description}
                                    </td>
                                    <td className="td text-xs">{l.unit}</td>
                                    <td className="td text-right font-semibold">{l.qty.toFixed(2)}</td>
                                    <td className="td text-xs">{l.itemType ?? '—'}</td>
                                    <td className="td text-right">
                                      {l.priceFound ? money(l.unitPrice, '') : '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </label>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ---- signature ---- */}
          <div className="surface">
            <div className="surface-head">
              <h2 className="text-sm font-semibold text-fg">Signature &amp; stamp</h2>
            </div>
            <div className="grid gap-6 px-5 py-5 lg:grid-cols-[1.15fr_1fr]">
              <SignatureInput
                label="Implementation contractor signature"
                onChange={setSignature}
              />

              <div className="flex flex-col gap-4">
                <div>
                  <label className="label">Company stamp</label>
                  <div className="surface flex items-center gap-4 px-4 py-4">
                    <img
                      src="/brand/company-stamp.png"
                      alt="Smart Life stamp"
                      className="h-20 w-20 shrink-0 object-contain"
                    />
                    <div className="text-xs leading-relaxed text-fg-muted">
                      The Smart Life stamp is built into the system and applied to every GCL —
                      nothing to upload.
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-line bg-card/60 px-4 py-3 text-[11px] leading-relaxed text-fg-subtle">
                  Your signature goes into every row&apos;s <em>IMPL Contr. Initial</em> cell and into
                  the signature block, overlapping the stamp the way a wet-signed form does. You can
                  change it later from the package screen.
                </div>
              </div>
            </div>
          </div>

          {/* ---- form ---- */}
          <div className="surface">
            <div className="surface-head">
              <h2 className="text-sm font-semibold text-fg">GCL details</h2>
            </div>
            {preview.quantityColumns.length > 0 && (
              <div className="border-b border-line/60 px-5 py-5">
                <QuantityFieldPicker
                  columns={preview.quantityColumns.map((c) => ({
                    ...c,
                    total: chosen.reduce((a, s) => a + (s.columnTotals?.[c.key] ?? 0), 0),
                  }))}
                  value={form.quantityFieldKey}
                  onChange={(k) => set('quantityFieldKey', k)}
                  hint="Numeric columns found in the scope sheet. The one you pick becomes the quantity on the GCL and drives the downstream totals."
                />
              </div>
            )}

            <div className="grid gap-4 px-5 py-5 md:grid-cols-4">
              <Field label="Region" hint="Not present in the scope sheet">
                <Input placeholder="West" value={form.region}
                       onChange={(e) => set('region', e.target.value)} />
              </Field>
              <Field label="District">
                <Input placeholder="Jeddah" value={form.district}
                       onChange={(e) => set('district', e.target.value)} />
              </Field>
              <Field label="GCL Date">
                <Input type="date" value={form.gclDate}
                       onChange={(e) => set('gclDate', e.target.value)} />
              </Field>


              <Field label="Contractor PM name">
                <Input value={form.contractorPmName}
                       onChange={(e) => set('contractorPmName', e.target.value)} />
              </Field>
              <Field label="Contractor PM ID">
                <Input value={form.contractorPmId}
                       onChange={(e) => set('contractorPmId', e.target.value)} />
              </Field>
              <Field label="MSP representative">
                <Input value={form.mspRepName}
                       onChange={(e) => set('mspRepName', e.target.value)} />
              </Field>
              <Field label="MSP sign date">
                <Input type="date" value={form.mspSignDate}
                       onChange={(e) => set('mspSignDate', e.target.value)} />
              </Field>

              <div className="md:col-span-4">
                <Field label="Remarks" hint="Printed under the instructions box, as on a hand-annotated GCL">
                  <Textarea className="h-20" value={form.notes}
                            onChange={(e) => set('notes', e.target.value)} />
                </Field>
              </div>

              <label className="flex items-center gap-2 text-sm text-fg-muted md:col-span-4">
                <input type="checkbox" checked={form.overwrite}
                       onChange={(e) => set('overwrite', e.target.checked)}
                       className="h-4 w-4 rounded border-line" />
                Replace existing packages with the same WO number
              </label>
            </div>

            <div className="flex items-center justify-between border-t border-line px-5 py-4">
              <div className="text-sm text-fg-muted">
                {chosen.length} site{chosen.length === 1 ? '' : 's'} selected ·{' '}
                <span className="font-semibold text-fg">{money(total)}</span>
              </div>
              <Button variant="gradient" onClick={create} disabled={busy !== null || !chosen.length}>
                {busy === 'create' ? <Spinner label="Creating…" /> : (
                  <><FileSignature size={16} /> Create GCL <ArrowRight size={16} /></>
                )}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
