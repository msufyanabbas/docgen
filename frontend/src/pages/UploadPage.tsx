import { AlertTriangle, ArrowLeft, ArrowRight, Download, FileText, Layers } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { Alert, Spinner } from '../components/ui/Feedback';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardHead } from '../components/ui/Card';
import { Checkbox, Field, Input, Select, Textarea } from '../components/ui/Field';
import { api, money } from '../lib/api';
import {
  ACCEPTANCE_LABEL, ACCEPTANCE_OUTCOME,
  type Acceptance, type BulkCommitResult, type BulkFilePreview,
} from '../lib/types';

/**
 * One project's signed GCL.
 *
 * There is nothing to upload: the document is already attached to the project's
 * PAT sign-off on the tracker, so it is fetched, read and priced. What it was
 * signed off as — with oil or without — decides whether the site ends up on a
 * PAC or a FAC.
 */
export default function UploadPage() {
  const [params] = useSearchParams();
  const siteId = params.get('project');

  const [file, setFile] = useState<BulkFilePreview | null>(null);
  const [acceptance, setAcceptance] = useState<Acceptance | ''>('');
  const [result, setResult] = useState<BulkCommitResult | null>(null);
  const [busy, setBusy] = useState<'read' | 'commit' | null>('read');
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ serviceDate: '', startDate: '', notes: '' });
  const [replaceExisting, setReplaceExisting] = useState(false);

  useEffect(() => {
    if (!siteId) return;
    setBusy('read');
    api
      .get<BulkFilePreview>(`/gcl/signed/${encodeURIComponent(siteId)}/preview`)
      .then((f) => {
        setFile(f);
        if (f.acceptance) setAcceptance(f.acceptance);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setBusy(null));
  }, [siteId]);

  async function commit() {
    setBusy('commit');
    setError(null);
    try {
      const r = await api.send<BulkCommitResult>(
        `/gcl/signed/${encodeURIComponent(siteId!)}`,
        'POST',
        {
          acceptance,
          onDuplicate: replaceExisting ? 'overwrite' : 'skip',
          ...(form.serviceDate ? { serviceDate: form.serviceDate } : {}),
          ...(form.startDate ? { startDate: form.startDate } : {}),
          ...(form.notes ? { notes: form.notes } : {}),
        },
      );
      setResult(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!siteId) return <Navigate to="/gcl" replace />;

  return (
    <div className="space-y-6">
      <Link to="/gcl" className="inline-flex items-center gap-1 text-xs text-fg-subtle hover:text-fg">
        <ArrowLeft size={13} /> All GCLs
      </Link>

      {error && <Alert kind="error" title="Something went wrong">{error}</Alert>}
      {busy === 'read' && <Spinner label="Fetching the signed GCL from the tracker…" />}

      {result ? (
        <Card>
          <CardHead
            title={`Batch ${result.reference}`}
            hint={`${result.committed} site committed`}
            icon={<Layers size={15} />}
            actions={
              <Button
                variant="gradient"
                onClick={() => api.download(`/gcl/bulk/${result.batchId}/zip`, 'documents.zip')}
              >
                <Download size={15} /> Download all (.zip)
              </Button>
            }
          />
          <div className="flex flex-wrap gap-2 px-4 py-4 sm:px-5">
            {result.accepted > 0 && <Badge tone="success">PAC and FAC issued</Badge>}
            {result.acceptedWithOil > 0 && <Badge tone="warn">PAC issued</Badge>}
            {result.rejected > 0 && <Badge tone="danger">rejected — no certificate</Badge>}
          </div>
          <div className="border-t border-line/60 px-4 py-4 sm:px-5">
            <p className="label">Documents</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {result.documents.map((d) => (
                <Button
                  key={d.id}
                  variant="outline"
                  size="sm"
                  onClick={() => api.download(`/documents/${d.id}/download`, d.fileName)}
                >
                  <Download size={13} /> {d.type.replace(/_(PDF|XLSX)$/, '')}
                </Button>
              ))}
            </div>
          </div>
        </Card>
      ) : (
        file && (
          <>
            <Card>
              <CardHead
                title="Signed GCL"
                hint="Read from the project's PAT sign-off"
                icon={<FileText size={15} />}
                actions={<Badge tone="cyan">{file.fileName}</Badge>}
              />
              <dl className="grid grid-cols-2 gap-4 px-4 py-5 text-sm sm:grid-cols-4 sm:px-5">
                {[
                  ['Project', `${file.siteId} · ${file.projectTitle}`],
                  ['Site on GCL', file.siteNo ?? '—'],
                  ['Lines', String(file.lineCount ?? 0)],
                  ['Value', money(file.total ?? 0)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{k}</dt>
                    <dd className="mt-0.5 truncate font-medium text-fg">{v}</dd>
                  </div>
                ))}
              </dl>

              {file.unpricedItems && file.unpricedItems.length > 0 && (
                <div className="border-t border-line/60 px-4 py-3 sm:px-5">
                  <Alert kind="warn" title={`${file.unpricedItems.length} item(s) have no UPL price`}>
                    {file.unpricedItems.join(', ')} — these price at zero until added.
                  </Alert>
                </div>
              )}
            </Card>

            <Card>
              <CardHead
                title="Acceptance"
                hint="Read from the sign-off box — confirm before committing"
              />
              <div className="grid gap-4 px-4 py-5 sm:grid-cols-2 sm:px-5">
                <Field
                  label="Signed off as"
                  hint={
                    file.acceptanceConfidence === 'high'
                      ? 'Read clearly from the document'
                      : (file.acceptanceNote ?? 'The box was hard to read — please check')
                  }
                >
                  <Select
                    value={acceptance}
                    onChange={(e) => setAcceptance(e.target.value as Acceptance)}
                  >
                    <option value="">Select…</option>
                    {(Object.keys(ACCEPTANCE_LABEL) as Acceptance[]).map((k) => (
                      <option key={k} value={k}>{ACCEPTANCE_LABEL[k]}</option>
                    ))}
                  </Select>
                </Field>

                <div className="flex items-end">
                  {acceptance ? (
                    <p className="text-sm text-fg-muted">
                      Produces{' '}
                      <Badge tone={acceptance === 'ACCEPTED' ? 'success' : acceptance === 'ACCEPTED_WITH_OIL' ? 'warn' : 'neutral'}>
                        {ACCEPTANCE_OUTCOME[acceptance]}
                      </Badge>
                      {acceptance === 'REJECTED' && ' — no certificate is issued'}
                    </p>
                  ) : (
                    <p className="flex items-center gap-1.5 text-sm text-amber-500">
                      <AlertTriangle size={14} /> Confirm what was ticked
                    </p>
                  )}
                </div>
              </div>
            </Card>

            <Card>
              <CardHead title="Dates and notes" hint="All editable afterwards" />
              <div className="grid gap-4 px-4 py-5 sm:grid-cols-3 sm:px-5">
                <Field label="Handover date">
                  <Input
                    type="date"
                    value={form.serviceDate}
                    onChange={(e) => setForm({ ...form, serviceDate: e.target.value })}
                  />
                </Field>
                <Field label="Start date">
                  <Input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  />
                </Field>
                <Field label="Remarks">
                  <Textarea
                    className="h-16"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </Field>
              </div>
              <div className="border-t border-line/60 px-4 py-4 sm:px-5">
                <Checkbox
                  checked={replaceExisting}
                  onChange={setReplaceExisting}
                  label={
                    <span className="text-sm">
                      Replace the existing package if this GCL was already processed
                    </span>
                  }
                />
              </div>
            </Card>

            <div className="sticky bottom-0 -mx-4 border-t border-line/60 bg-canvas/85 px-4 py-3 backdrop-blur-md sm:-mx-5 sm:px-5 lg:-mx-8 lg:px-8">
              <div className="flex flex-wrap items-center gap-3">
                <span className="min-w-0 flex-1 text-xs text-fg-subtle">
                  {file.lineCount} lines · {money(file.total ?? 0)}
                </span>
                <Button
                  variant="gradient"
                  onClick={commit}
                  disabled={!acceptance}
                  loading={busy === 'commit'}
                >
                  Create package <ArrowRight size={15} />
                </Button>
              </div>
            </div>
          </>
        )
      )}
    </div>
  );
}
