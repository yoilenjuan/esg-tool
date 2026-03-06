'use client';

import { useState } from 'react';
import { ScanForm } from '@/components/ScanForm';
import { ScanProgressPanel } from '@/components/ScanProgress';
import { ResultsView } from '@/components/ResultsView';
import { startScan } from '@/lib/api';
import type { ScanOptions, ScanRunResult } from '@/lib/types';

type AppState = 'idle' | 'starting' | 'scanning' | 'done' | 'error';

export default function HomePage() {
  const [appState, setAppState] = useState<AppState>('idle');
  const [runId, setRunId] = useState<string | null>(null);
  const [result, setResult] = useState<ScanRunResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  async function handleScanStart(options: ScanOptions) {
    setAppState('starting');
    setErrorMsg('');
    setResult(null);
    setRunId(null);
    try {
      const newRunId = await startScan(options);
      setRunId(newRunId);
      setAppState('scanning');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setAppState('error');
    }
  }

  function handleScanComplete(scanResult: ScanRunResult) {
    setResult(scanResult);
    setAppState('done');
  }

  function handleScanError(msg: string) {
    setErrorMsg(msg);
    setAppState('error');
  }

  function handleReset() {
    setAppState('idle');
    setRunId(null);
    setResult(null);
    setErrorMsg('');
  }

  const isStarting = appState === 'starting';
  const showForm = appState === 'idle' || appState === 'error' || appState === 'starting';

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="bg-gradient-to-r from-slate-900 to-brand-700 text-white shadow-lg">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-brand-200 mb-0.5">
              ESG Tool
            </div>
            <h1 className="text-lg font-black tracking-tight leading-none">
              Retail Bias Scanner
            </h1>
          </div>
          <p className="text-xs text-brand-200 text-right hidden sm:block leading-relaxed">
            Detect inclusivity issues · Capture evidence<br />
            Generate PDF reports
          </p>
        </div>
      </header>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10">

        {/* Hero blurb — only when idle */}
        {appState === 'idle' && (
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="text-3xl font-black text-slate-900 mb-3 tracking-tight">
              Scan a Retail Site for Bias & Inclusivity Gaps
            </h2>
            <p className="text-slate-500 text-sm leading-relaxed">
              Provide a URL and the scanner will crawl forms, analyse 8 inclusivity dimensions,
              capture screenshots, and generate a detailed PDF report with sales-impact analysis.
            </p>
          </div>
        )}

        {/* Form (idle / starting / error) */}
        {showForm && (
          <div className="space-y-5">
            <ScanForm onSubmit={handleScanStart} loading={isStarting} />
            {appState === 'error' && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div>
                  <div className="text-sm font-bold text-red-700">Scan failed</div>
                  <div className="text-sm text-red-600 mt-0.5">{errorMsg}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Progress panel */}
        {appState === 'scanning' && runId && (
          <ScanProgressPanel
            runId={runId}
            onComplete={handleScanComplete}
            onError={handleScanError}
          />
        )}

        {/* Results */}
        {appState === 'done' && result && (
          <ResultsView result={result} onReset={handleReset} />
        )}
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-400">
        ESG Retail Bias Scanner · Scores are approximate heuristics only ·
        Visual diversity analysis does not identify individuals
      </footer>
    </div>
  );
}
