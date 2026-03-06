/**
 * Thin API client for the ESG Scanner backend.
 */
import type { ScanOptions, ScanProgress, ScanRunResult } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
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
  const res = await fetch(`${API_BASE}/api/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ options }),
  });
  const data = await handleResponse<{ runId: string }>(res);
  return data.runId;
}

/** GET /api/scan/:runId/progress */
export async function getProgress(runId: string): Promise<ScanProgress> {
  const res = await fetch(`${API_BASE}/api/scan/${runId}/progress`);
  const data = await handleResponse<{ progress: ScanProgress }>(res);
  return data.progress;
}

/** GET /api/runs/:runId — fetch the completed scan result. */
export async function getReport(runId: string): Promise<ScanRunResult> {
  const res = await fetch(`${API_BASE}/api/runs/${runId}`);
  const data = await handleResponse<{ run: ScanRunResult }>(res);
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
