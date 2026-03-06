'use client';

import { useState } from 'react';
import type { ScanOptions, ScanDepth } from '@/lib/types';
import { URLInput } from './URLInput';
import { ScanOptions as ScanOptionsPanel } from './ScanOptions';
import { RunButton } from './RunButton';
import { RetailScopeInfo } from './RetailScopeInfo';

interface ScanFormProps {
  onSubmit: (options: ScanOptions) => Promise<void>;
  loading?: boolean;
}

export function ScanForm({ onSubmit, loading }: ScanFormProps) {
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState('');
  const [depth, setDepth] = useState<ScanDepth>('standard');
  const [maxPages, setMaxPages] = useState(15);
  const [recordVideo, setRecordVideo] = useState(false);

  function validateUrl(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return 'URL is required';
    try {
      const parsed = new URL(trimmed);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return 'URL must start with http:// or https://';
      }
    } catch {
      return 'Please enter a valid URL (e.g. https://www.example.com)';
    }
    return '';
  }

  function handleUrlChange(val: string) {
    setUrl(val);
    if (urlError) setUrlError(validateUrl(val));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validateUrl(url);
    if (err) {
      setUrlError(err);
      return;
    }
    await onSubmit({ url: url.trim(), depth, maxPages, recordVideo });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      {/* Left: form (takes 2/3 width on large screens) */}
      <form
        onSubmit={handleSubmit}
        className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 p-8 space-y-6"
      >
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-1">Start a New Scan</h2>
          <p className="text-sm text-slate-500">
            Provide a retail URL and configure the scan parameters below.
          </p>
        </div>

        <URLInput
          value={url}
          onChange={handleUrlChange}
          error={urlError}
          disabled={loading}
        />

        <div className="border-t border-slate-100 pt-5">
          <ScanOptionsPanel
            depth={depth}
            onDepthChange={setDepth}
            maxPages={maxPages}
            onMaxPagesChange={setMaxPages}
            recordVideo={recordVideo}
            onRecordVideoChange={setRecordVideo}
            disabled={loading}
          />
        </div>

        <RunButton loading={loading} />
      </form>

      {/* Right: scope info box */}
      <div className="lg:col-span-1">
        <RetailScopeInfo />
      </div>
    </div>
  );
}
