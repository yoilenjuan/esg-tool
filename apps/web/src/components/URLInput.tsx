'use client';

import clsx from 'clsx';

interface URLInputProps {
  value: string;
  onChange: (url: string) => void;
  error: string;
  disabled?: boolean;
}

export function URLInput({ value, onChange, error, disabled }: URLInputProps) {
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-700 mb-1.5">
        Target URL <span className="text-red-500">*</span>
      </label>
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </span>
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://www.example-retailer.com"
          disabled={disabled}
          className={clsx(
            'w-full rounded-xl border pl-10 pr-4 py-3 text-sm placeholder-slate-400',
            'focus:outline-none focus:ring-2 focus:ring-brand-500 transition',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error
              ? 'border-red-400 bg-red-50 focus:ring-red-400'
              : 'border-slate-300 bg-white hover:border-slate-400',
          )}
          autoComplete="url"
          spellCheck={false}
        />
      </div>
      {error && (
        <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
          <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}
