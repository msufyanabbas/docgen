import { ArrowLeft, ArrowRight, ScanLine, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import FileDrop from '../components/FileDrop';
import QuantityFieldPicker from '../components/QuantityFieldPicker';
import { Alert, Spinner } from '../components/ui/Feedback';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardHead } from '../components/ui/Card';
import { Field, Input, Textarea } from '../components/ui/Field';
import { api, money } from '../lib/api';
import type { GclPreview, Package, QuantitySource } from '../lib/types';

/**
 * The other way in: a GCL that has already been signed on site.
 *
 * The PDF is parsed, priced against the UPL and previewed before anything is
 * saved. Eligibility is different from Create — this needs an approved PAT,
 * because a signed GCL only exists once the work has been accepted.
 */
export default function UploadPage() {
  const [params] = useSearchParams();
  const externalSiteId = params.get('project');
  const nav = useNavigate();

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<GclPreview | null>(null);
  const [busy, setBusy] = useState<'parse' | 'create' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    quantityFieldKey: '',
    quantitySource: 'AS_BUILT' as QuantitySource,
    serviceDate: '',
    startDate: '',
    notes: '',
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

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
      const pkg = await api.upload<Package>('/gcl/upload', file, {
        ...form,
        externalSiteId: externalSiteId!,
      });
      // Navigate last: this component unmounts, so nothing touches state after.
      nav(`/packages/${pkg.id}`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  if (!externalSiteId) return <Navigate to="/gcl" replace />;

  const selectedTotal =
    preview?.quantityColumns.find((c) => c.key === form.quantityFieldKey)?.total ?? 0;

  return (
    <div className="space-y-6">
      <Link to="/gcl" className="inline-flex items-center gap-1 text-xs text-fg-subtle hover:text-fg">
        <ArrowLeft size={13} /> All GCLs
      </Link>

      {error && <Alert kind="error" title="Something went wrong">{error}</Alert>}

      <FileDrop
        accept="application/pdf,.pdf"
        file={file}
        onFile={parse}
        hint="The signed Handing Over GCL, as a PDF"
        tour="dropzone"
      />

      {busy === 'parse' && <Spinner label="Reading the GCL…" />}

      {preview && (
        <>
          {preview.warnings?.length ? (
            <Alert kind="warn" title="Warnings while reading the document">
              <ul className="list-inside list-disc">
                {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </Alert>
          ) : null}

          <Card>
            <CardHead
              title="What was read"
              hint="Nothing is saved until you commit"
              icon={<ScanLine size={15} />}
              actions={<Badge tone="cyan">{preview.lines.length} lines</Badge>}
            />

            <div className="border-b border-line/60 px-4 py-5 sm:px-5">
              <QuantityFieldPicker
                columns={preview.quantityColumns}
                value={form.quantityFieldKey}
                onChange={(k) => set('quantityFieldKey', k)}
              />
            </div>

            <div className="-mx-px overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr>
                    <th className="th w-12">No</th>
                    <th className="th">Item Code</th>
                    <th className="th">Description</th>
                    <th className="th">Unit</th>
                    {preview.quantityColumns.map((c) => (
                      <th key={c.key} className="th text-right">{c.label}</th>
                    ))}
                    <th className="th text-right">Unit Price</th>
                    <th className="th text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.lines.map((l) => (
                    <tr key={l.no} className="row-hover">
                      <td className="td text-fg-subtle">{l.no}</td>
                      <td className="td font-mono text-xs font-semibold text-fg">{l.itemCode}</td>
                      <td className="td max-w-md truncate text-fg-muted" title={l.description}>
                        {l.description}
                      </td>
                      <td className="td text-xs">{l.unit ?? '—'}</td>
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
                      <td className="td text-right">
                        {l.priceFound ? money(l.unitPrice, '') : '—'}
                      </td>
                      <td className="td text-right font-semibold">
                        {money(l.totals?.[form.quantityFieldKey] ?? 0, '')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {preview.unpricedItems.length > 0 && (
            <Alert kind="warn" title={`${preview.unpricedItems.length} item(s) have no price in the UPL`}>
              {preview.unpricedItems.join(', ')} — these will price at zero until they are added.
            </Alert>
          )}

          <Card>
            <CardHead title="Dates and notes" hint="All editable afterwards" />
            <div className="grid gap-4 px-4 py-5 sm:grid-cols-2 sm:px-5">
              <Field label="Handover date" hint="Printed on the PAC">
                <Input
                  type="date"
                  value={form.serviceDate}
                  onChange={(e) => set('serviceDate', e.target.value)}
                />
              </Field>
              <Field label="Start date">
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => set('startDate', e.target.value)}
                />
              </Field>
              <Field label="Remarks" className="sm:col-span-2">
                <Textarea
                  className="h-20"
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                />
              </Field>
            </div>
          </Card>

          <div className="sticky bottom-0 -mx-4 border-t border-line/60 bg-canvas/85 px-4 py-3 backdrop-blur-md sm:-mx-5 sm:px-5 lg:-mx-8 lg:px-8">
            <div className="flex flex-wrap items-center gap-3">
              <span className="min-w-0 flex-1 text-xs text-fg-subtle">
                {preview.lines.length} lines · {money(selectedTotal)}
              </span>
              <Button
                variant="gradient"
                onClick={create}
                disabled={!form.quantityFieldKey}
                loading={busy === 'create'}
              >
                <Sparkles size={15} /> Create package <ArrowRight size={15} />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
