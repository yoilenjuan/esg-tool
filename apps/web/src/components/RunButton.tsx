'use client';

import clsx from 'clsx';

interface RunButtonProps {
  loading?: boolean;
  disabled?: boolean;
  label?: string;
}

export function RunButton({ loading, disabled, label = 'Run Scan' }: RunButtonProps) {
  return (
    <button
      type="submit"
      disabled={disabled || loading}
      className={clsx(
        'w-full relative overflow-hidden rounded-xl py-3.5 font-bold text-sm transition',
        'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
        loading || disabled
          ? 'bg-brand-400 cursor-not-allowed text-white/80'
          : 'bg-brand-600 hover:bg-brand-700 text-white active:scale-[0.99]',
      )}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <svg
            className="animate-spin w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Starting scan…
        </span>
      ) : (
        <span className="flex items-center justify-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          {label}
        </span>
      )}
    </button>
  );
}
