/**
 * Thin API client for the ESG Scanner backend.
 */
import type { ScanOptions, ScanProgress, ScanRunResult } from './types';

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// Log the API base on load so it's visible in browser console
console.info('[ESG API] API_BASE =', API_BASE, '| NEXT_PUBLIC_API_URL env =', process.env.NEXT_PUBLIC_API_URL ?? '(not set — using localhost fallback)');

async function handleResponse<T>(res: Response, url: string): Promise<T> {
  console.info(`[ESG API] ← ${res.status} ${res.statusText}  ${url}`);
  if (!res.ok) {
    let msg = `HTTP ${res.status} from ${url}`;
    try {
      const body = await res.json();
      console.error('[ESG API] Error body:', body);
      msg = body?.error ?? msg;
    } catch {
      // ignore parse error
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

/** POST /api/scan — start a new scan. Returns the runId. */
export async function startScan(options: ScanOptions): Promise<string> {
  const url = `${API_BASE}/api/scan`;
  console.info('[ESG API] → POST', url, options);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ options }),
    });
  } catch (err) {
    console.error('[ESG API] Network error on POST', url, err);
    throw new Error(`Network error — could not reach API at ${API_BASE}. Is the API server running and NEXT_PUBLIC_API_URL set correctly?`);
  }
  const data = await handleResponse<{ runId: string }>(res, url);
  console.info('[ESG API] Scan started, runId =', data.runId);
  return data.runId;
}

/** GET /api/scan/:runId/progress */
export async function getProgress(runId: string): Promise<ScanProgress> {
  const url = `${API_BASE}/api/scan/${runId}/progress`;
  console.debug('[ESG API] → GET', url);
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    console.error('[ESG API] Network error on GET', url, err);
    throw err;
  }
  const data = await handleResponse<{ progress: ScanProgress }>(res, url);
  console.debug('[ESG API] Progress:', data.progress.status, data.progress.percentComplete + '%', data.progress.currentStep);
  return data.progress;
}

/** GET /api/runs/:runId — fetch the completed scan result. */
export async function getReport(runId: string): Promise<ScanRunResult> {
  const url = `${API_BASE}/api/runs/${runId}`;
  console.info('[ESG API] → GET', url);
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    console.error('[ESG API] Network error on GET', url, err);
    throw err;
  }
  const data = await handleResponse<{ run: ScanRunResult }>(res, url);
  console.info('[ESG API] Report loaded for runId =', runId);
  return data.run;
}

/** URL for the PDF download (direct link). */
export function pdfDownloadUrl(runId: string): string {
  return `${API_BASE}/api/runs/${runId}/report`;
}

/** URL for the HTML preview. */
export function htmlPreviewUrl(runId: string): string {
  return `${API_BASE}/api/runs/${runId}/html`;
}
