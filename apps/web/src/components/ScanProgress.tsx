'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { getProgress, getReport } from '@/lib/api';
import type { ScanProgress, ScanRunResult } from '@/lib/types';

interface ScanProgressPanelProps {
  runId: string;
  onComplete: (result: ScanRunResult) => void;
  onError: (message: string) => void;
}

function formatElapsed(startedAt: string): string {
  const secs = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

const PIPELINE_STEPS = [
  'Launching browser',
  'Discovering pages',
  'Analysing forms',
  'Probing EAI',
  'Checking language',
  'Evaluating imagery',
  'Generating report',
];

// Category → Tailwind badge colours
const CATEGORY_COLORS: Record<string, string> = {
  home:       'bg-slate-100 text-slate-600',
  register:   'bg-green-100 text-green-700',
  login:      'bg-blue-100 text-blue-700',
  checkout:   'bg-orange-100 text-orange-700',
  cart:       'bg-amber-100 text-amber-700',
  account:    'bg-purple-100 text-purple-700',
  product:    'bg-teal-100 text-teal-700',
  marketing:  'bg-pink-100 text-pink-700',
  newsletter: 'bg-indigo-100 text-indigo-700',
  contact:    'bg-cyan-100 text-cyan-700',
  careers:    'bg-rose-100 text-rose-700',
  other:      'bg-slate-100 text-slate-500',
};

export function ScanProgressPanel({ runId, onComplete, onError }: ScanProgressPanelProps) {
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [elapsed, setElapsed] = useState('0s');
  // Persistent accumulated crawl log — never resets during an active scan
  const [crawlLog, setCrawlLog] = useState<Array<{ url: string; category: string }>>([]);
  const seenUrlsRef = useRef(new Set<string>());
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const doneRef = useRef(false);

  // Tick elapsed clock every second once we have a startedAt
  useEffect(() => {
    if (!progress?.startedAt) return;
    const startedAt = progress.startedAt;
    setElapsed(formatElapsed(startedAt));
    clockRef.current = setInterval(() => setElapsed(formatElapsed(startedAt)), 1000);
    return () => {
      if (clockRef.current) clearInterval(clockRef.current);
    };
  }, [progress?.startedAt]);

  // Poll progress every 2 s
  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval>;

    async function poll() {
      if (doneRef.current || cancelled) return;
      try {
        const p = await getProgress(runId);
        if (!cancelled) {
          setProgress(p);
          // Accumulate crawl log — append pages we haven't seen yet (newest first)
          if (p.recentPages && p.recentPages.length > 0) {
            const fresh = p.recentPages.filter((rp) => !seenUrlsRef.current.has(rp.url));
            if (fresh.length > 0) {
              fresh.forEach((rp) => seenUrlsRef.current.add(rp.url));
              setCrawlLog((prev) => [...fresh, ...prev]);
            }
          }
        }

        if (p.status === 'completed' && !doneRef.current) {
          doneRef.current = true;
          clearInterval(pollTimer);
          console.info('[ScanProgress] Status = completed, fetching report for', runId);
          try {
            const result = await getReport(runId);
            if (!cancelled) onComplete(result);
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Failed to load report';
            console.error('[ScanProgress] Failed to load report:', msg);
            if (!cancelled) onError(msg);
          }
        } else if (p.status === 'failed' && !doneRef.current) {
          doneRef.current = true;
          clearInterval(pollTimer);
          const errMsg = p.errorMessage ?? 'Scan failed';
          console.error('[ScanProgress] Scan failed on server:', errMsg);
          if (!cancelled) onError(errMsg);
        }
      } catch (pollErr) {
        console.warn('[ScanProgress] Transient poll error (will retry):', pollErr);
      }
    }

    poll();
    pollTimer = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(pollTimer);
    };
  }, [runId, onComplete, onError]);

  const pct = progress?.percentComplete ?? 0;
  const step = progress?.currentStep ?? 'Initialising…';
  const pagesScanned = progress?.pagesScanned ?? 0;
  const pagesDiscovered = progress?.pagesDiscovered ?? 0;
  // Use accumulated log —  persists after discovery phase ends
  const displayLog = crawlLog;

  const activeStep = PIPELINE_STEPS.findIndex((s) =>
    step.toLowerCase().includes(s.toLowerCase()),
  );

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Scan in Progress</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Run ID:{' '}
            <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
              {runId.slice(0, 8)}…
            </code>
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-3xl font-black text-brand-600">{pct}%</div>
          <div className="text-xs text-slate-400 mt-0.5">⏱ {elapsed}</div>
        </div>
      </div>

      {/* Current step + progress bar */}
      <div>
        <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
          <span className="font-medium flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
            {step}
          </span>
          <span>
            {pagesScanned} / {pagesDiscovered > 0 ? pagesDiscovered : '?'} pages
          </span>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
          <div
            className="bg-gradient-to-r from-brand-500 to-brand-400 h-3 rounded-full transition-all duration-700"
            style={{ width: `${Math.max(pct, 2)}%` }}
          />
        </div>
      </div>

      {/* Pipeline steps */}
      <div className="grid grid-cols-7 gap-1">
        {PIPELINE_STEPS.map((s, i) => {
          const done = pct === 100 || activeStep > i;
          const active = activeStep === i;
          return (
            <div key={s} className="flex flex-col items-center gap-1.5">
              <div
                className={clsx(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all',
                  done
                    ? 'bg-green-500 text-white'
                    : active
                    ? 'bg-brand-600 text-white ring-2 ring-brand-200 ring-offset-1'
                    : 'bg-slate-200 text-slate-400',
                )}
              >
                {done ? '✓' : i + 1}
              </div>
              <div
                className={clsx(
                  'text-center leading-tight hidden sm:block text-[9px]',
                  active ? 'text-brand-600 font-semibold' : 'text-slate-400',
                )}
              >
                {s.split(' ').map((word, wi) => (
                  <span key={wi} className="block">
                    {word}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-slate-400 text-center italic">
        This may take several minutes depending on scan depth and site complexity.
      </p>

      {/* ── Crawl Log ──────────────────────────────────────────── */}
      {displayLog.length > 0 && (
        <div className="border border-slate-100 rounded-xl p-4 bg-slate-50">
          <div className="text-[10px] font-bold tracking-widest uppercase text-slate-400 mb-3 flex items-center gap-2">
            {pct < 100 ? (
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse inline-block" />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
            )}
            Pages crawled
            <span className="ml-auto text-slate-400 normal-case tracking-normal font-semibold">
              {displayLog.length} page{displayLog.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-2 max-h-52 overflow-y-auto">
            {displayLog.map((p, i) => (
              <div key={p.url} className="flex items-center gap-2 text-xs">
                <span
                  className={clsx(
                    'shrink-0 font-bold px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide',
                    CATEGORY_COLORS[p.category] ?? 'bg-slate-100 text-slate-500',
                  )}
                >
                  {p.category}
                </span>
                <span
                  className="text-slate-500 font-mono truncate min-w-0"
                  title={p.url}
                >
                  {p.url.replace(/^https?:\/\//, '')}
                </span>
                {i === 0 && pct < 100 && (
                  <span className="shrink-0 text-[9px] text-brand-400 font-semibold animate-pulse">
                    now
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
