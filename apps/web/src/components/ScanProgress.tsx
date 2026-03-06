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

export function ScanProgressPanel({ runId, onComplete, onError }: ScanProgressPanelProps) {
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [elapsed, setElapsed] = useState('0s');
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
        if (cancelled) return;
        setProgress(p);

        if (p.status === 'completed' && !doneRef.current) {
          doneRef.current = true;
          clearInterval(pollTimer);
          try {
            const result = await getReport(runId);
            if (!cancelled) onComplete(result);
          } catch (e) {
            if (!cancelled) onError(e instanceof Error ? e.message : 'Failed to load report');
          }
        } else if (p.status === 'failed' && !doneRef.current) {
          doneRef.current = true;
          clearInterval(pollTimer);
          if (!cancelled) onError(p.errorMessage ?? 'Scan failed');
        }
      } catch {
        // transient error — keep polling
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
    </div>
  );
}
