'use client';

import clsx from 'clsx';
import type { ScanDepth } from '@/lib/types';

interface ScanOptionsProps {
  depth: ScanDepth;
  onDepthChange: (d: ScanDepth) => void;
  maxPages: number;
  onMaxPagesChange: (n: number) => void;
  recordVideo: boolean;
  onRecordVideoChange: (v: boolean) => void;
  disabled?: boolean;
}

const DEPTH_OPTIONS: { value: ScanDepth; label: string; desc: string; pages: string }[] = [
  { value: 'light',    label: 'Light',    desc: 'Quick overview',  pages: '≤ 5 pages'  },
  { value: 'standard', label: 'Standard', desc: 'Balanced scan',   pages: '≤ 15 pages' },
  { value: 'deep',     label: 'Deep',     desc: 'Thorough audit',  pages: '≤ 50 pages' },
];

export function ScanOptions({
  depth, onDepthChange,
  maxPages, onMaxPagesChange,
  recordVideo, onRecordVideoChange,
  disabled,
}: ScanOptionsProps) {
  return (
    <div className="space-y-5">
      {/* Depth selector */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">Scan Depth</label>
        <div className="grid grid-cols-3 gap-2.5">
          {DEPTH_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              onClick={() => onDepthChange(opt.value)}
              className={clsx(
                'rounded-xl border-2 p-3 text-left transition focus:outline-none',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                depth === opt.value
                  ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200'
                  : 'border-slate-200 bg-white hover:border-slate-300',
              )}
            >
              <div className="font-bold text-sm text-slate-800">{opt.label}</div>
              <div className="text-xs text-slate-500 mt-0.5">{opt.desc}</div>
              <div className="text-xs text-brand-600 font-medium mt-0.5">{opt.pages}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Max pages + Video toggle */}
      <div className="grid grid-cols-2 gap-5">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">
            Max Pages
            <span className="text-xs font-normal text-slate-400 ml-1.5">(1–50)</span>
          </label>
          <input
            type="number"
            min={1}
            max={50}
            value={maxPages}
            disabled={disabled}
            onChange={(e) => onMaxPagesChange(Math.min(50, Math.max(1, Number(e.target.value))))}
            className={clsx(
              'w-full rounded-xl border border-slate-300 px-4 py-3 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-brand-500 transition',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          />
        </div>

        <div className="flex flex-col justify-end pb-0.5">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onRecordVideoChange(!recordVideo)}
            className="flex items-center gap-3 cursor-pointer select-none group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {/* Toggle pill */}
            <div
              className={clsx(
                'relative w-11 h-6 rounded-full transition-colors',
                recordVideo ? 'bg-brand-600' : 'bg-slate-300',
              )}
            >
              <span
                className={clsx(
                  'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
                  recordVideo && 'translate-x-5',
                )}
              />
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold text-slate-700">Record Video</div>
              <div className="text-xs text-slate-400">.webm of the scan session</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
