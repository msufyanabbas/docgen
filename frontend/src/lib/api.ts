const BASE = '/api';

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      message = Array.isArray(body.message) ? body.message.join(', ') : body.message || message;
    } catch { /* non-JSON error body */ }
    throw new Error(message);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  get: <T>(path: string) => fetch(`${BASE}${path}`).then((r) => handle<T>(r)),

  send: <T>(path: string, method: string, body?: unknown) =>
    fetch(`${BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then((r) => handle<T>(r)),

  upload: <T>(path: string, file: File, fields: Record<string, string | number | boolean> = {}) => {
    const fd = new FormData();
    fd.append('file', file);
    for (const [k, v] of Object.entries(fields)) if (v !== '' && v != null) fd.append(k, String(v));
    return fetch(`${BASE}${path}`, { method: 'POST', body: fd }).then((r) => handle<T>(r));
  },

  fileUrl: (path: string) => `${BASE}${path}`,
};

export const money = (v: string | number | null | undefined, currency = 'SAR') =>
  `${Number(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

export const shortDate = (v: string | null | undefined) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' });
};

/** <input type="date"> wants yyyy-mm-dd in local terms; our dates are UTC midnight. */
export const dateInput = (v: string | null | undefined) => (v ? new Date(v).toISOString().slice(0, 10) : '');
