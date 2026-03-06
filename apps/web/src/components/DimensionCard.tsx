'use client';

import { useState } from 'react';
import type { DimensionFinding, ComplianceStatus } from '@esg/shared';
import clsx from 'clsx';

interface DimensionCardProps {
  finding: DimensionFinding;
}

const STATUS_CONFIG: Record<ComplianceStatus, { bg: string; border: string; badge: string; icon: string }> = {
  'Complies': {
    bg: 'bg-green-50',
    border: 'border-green-200',
    badge: 'bg-green-100 text-green-700',
    icon: '✅',
  },
  'Partially Complies': {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    badge: 'bg-amber-100 text-amber-700',
    icon: '⚠️',
  },
  'Does Not Comply': {
    bg: 'bg-red-50',
    border: 'border-red-200',
    badge: 'bg-red-100 text-red-700',
    icon: '❌',
  },
  'Not Requested': {
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    badge: 'bg-slate-100 text-slate-600',
    icon: '—',
  },
  'Mixed / Multi-flow': {
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    badge: 'bg-violet-100 text-violet-700',
    icon: '🔀',
  },
};

export function DimensionCard({ finding }: DimensionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const config = STATUS_CONFIG[finding.status];

  return (
    <div
      className={clsx(
        'rounded-2xl border-2 overflow-hidden transition-shadow',
        config.bg,
        config.border,
        expanded && 'shadow-md'
      )}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-5 text-left gap-4"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-lg">{config.icon}</span>
          <div className="min-w-0">
            <div className="font-bold text-slate-800 text-sm">{finding.dimensionLabel}</div>
            <div className="text-xs text-slate-500 mt-0.5 truncate">{finding.issueSummary}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className={clsx('text-xs font-bold px-3 py-1.5 rounded-full', config.badge)}>
            {finding.status}
          </span>
          <svg
            className={clsx('w-4 h-4 text-slate-400 transition-transform', expanded && 'rotate-180')}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-current border-opacity-10 px-5 pb-5 space-y-4">
          {/* Issues */}
          {finding.issues.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
                Issues Detected
              </h4>
              <ul className="space-y-1.5">
                {finding.issues.map((issue, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-700">
                    <span className="text-slate-400 flex-shrink-0 mt-0.5">•</span>
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendations */}
          <div>
            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
              Recommendations
            </h4>
            <ul className="space-y-1.5">
              {finding.recommendations.map((rec, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-700">
                  <span className="text-brand-500 flex-shrink-0 mt-0.5">→</span>
                  {rec}
                </li>
              ))}
            </ul>
          </div>

          {/* Good practices */}
          <div className="bg-white bg-opacity-60 rounded-xl px-4 py-3">
            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">
              Good Practice Examples
            </h4>
            <p className="text-xs text-slate-600">{finding.goodPracticeExamples.join(' · ')}</p>
          </div>

          {/* Sales Impact */}
          <div>
            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
              Sales Impact
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-red-50 rounded-xl p-3">
                <div className="text-xs font-bold text-red-700 mb-1">⚠️ Current Impact</div>
                <p className="text-xs text-red-800 leading-relaxed">{finding.salesImpact.currentImpact}</p>
              </div>
              <div className="bg-orange-50 rounded-xl p-3">
                <div className="text-xs font-bold text-orange-700 mb-1">🔮 Future Impact</div>
                <p className="text-xs text-orange-800 leading-relaxed">{finding.salesImpact.futureImpact}</p>
              </div>
              <div className="bg-green-50 rounded-xl p-3">
                <div className="text-xs font-bold text-green-700 mb-1">✅ Benefit if Resolved</div>
                <p className="text-xs text-green-800 leading-relaxed">{finding.salesImpact.benefitIfResolved}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
