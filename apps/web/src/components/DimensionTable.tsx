'use client';

import { useState } from 'react';
import clsx from 'clsx';
import type { DimensionResult, ComplianceStatus } from '@/lib/types';

interface DimensionTableProps {
  dimensions: DimensionResult[];
}

const STATUS_STYLE: Record<
  ComplianceStatus,
  { badge: string; row: string; icon: string }
> = {
  Complies:             { badge: 'bg-green-100 text-green-700',  row: 'hover:bg-green-50',  icon: '✅' },
  'Partially Complies': { badge: 'bg-amber-100 text-amber-700',  row: 'hover:bg-amber-50',  icon: '⚠️' },
  'Does Not Comply':    { badge: 'bg-red-100 text-red-700',      row: 'hover:bg-red-50',    icon: '❌' },
  'Not Requested':      { badge: 'bg-slate-100 text-slate-600',  row: 'hover:bg-slate-50',  icon: '—' },
  'Mixed / Multi-flow': { badge: 'bg-violet-100 text-violet-700',row: 'hover:bg-violet-50', icon: '🔀' },
};

function StatusBadge({ status }: { status: ComplianceStatus }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE['Not Requested'];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap',
        s.badge,
      )}
    >
      <span>{s.icon}</span>
      <span>{status}</span>
    </span>
  );
}

function ExpandedRow({ d }: { d: DimensionResult }) {
  return (
    <tr>
      <td colSpan={5} className="px-0 pb-0">
        <div className="bg-slate-50 border-t border-slate-200 px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-5 text-xs">
          {/* Current vs Good Practice */}
          <div>
            <div className="font-bold text-slate-600 uppercase tracking-wide mb-2">
              Current vs Good Practice
            </div>
            <div className="space-y-2">
              <div>
                <div className="text-slate-400 font-semibold mb-0.5">Observed:</div>
                <p className="text-slate-700">{d.actualVsGoodPractice.actualBehavior}</p>
              </div>
              <div>
                <div className="text-green-600 font-semibold mb-0.5">Best practice:</div>
                <p className="text-slate-700">{d.actualVsGoodPractice.goodPractice}</p>
              </div>
              {d.actualVsGoodPractice.brandExamples.length > 0 && (
                <div className="text-slate-500 italic">
                  Examples: {d.actualVsGoodPractice.brandExamples.join(', ')}
                </div>
              )}
            </div>
          </div>

          {/* Sales Impact */}
          <div>
            <div className="font-bold text-slate-600 uppercase tracking-wide mb-2">
              Sales Impact
            </div>
            <div className="space-y-2">
              {d.salesImpact.now.length > 0 && (
                <div>
                  <div className="text-red-600 font-semibold mb-0.5">Now:</div>
                  <ul className="space-y-0.5">
                    {d.salesImpact.now.map((item, i) => (
                      <li key={i} className="flex gap-1.5 text-slate-700">
                        <span className="text-slate-400 flex-shrink-0">•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {d.salesImpact.future.length > 0 && (
                <div>
                  <div className="text-amber-600 font-semibold mb-0.5">Future:</div>
                  <ul className="space-y-0.5">
                    {d.salesImpact.future.map((item, i) => (
                      <li key={i} className="flex gap-1.5 text-slate-700">
                        <span className="text-slate-400 flex-shrink-0">•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {d.salesImpact.benefitIfFixed.length > 0 && (
                <div>
                  <div className="text-green-600 font-semibold mb-0.5">Benefit if fixed:</div>
                  <ul className="space-y-0.5">
                    {d.salesImpact.benefitIfFixed.map((item, i) => (
                      <li key={i} className="flex gap-1.5 text-slate-700">
                        <span className="text-slate-400 flex-shrink-0">•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Recommendations */}
          <div>
            <div className="font-bold text-slate-600 uppercase tracking-wide mb-2">
              Recommendations
            </div>
            {d.recommendations.length > 0 ? (
              <ul className="space-y-1">
                {d.recommendations.map((r, i) => (
                  <li key={i} className="flex gap-1.5 text-slate-700">
                    <span className="text-brand-500 flex-shrink-0 font-bold">→</span>
                    {r}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-400 italic">No specific recommendations</p>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

export function DimensionTable({ dimensions }: DimensionTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="text-left py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wide w-8">
              #
            </th>
            <th className="text-left py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wide">
              Dimension
            </th>
            <th className="text-left py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wide">
              Status
            </th>
            <th className="text-left py-3 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wide hidden md:table-cell">
              Top Issue
            </th>
            <th className="py-3 px-4 w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {dimensions.map((d, i) => {
            const isOpen = expandedId === d.dimensionId;
            const s = STATUS_STYLE[d.status as ComplianceStatus] ?? STATUS_STYLE['Not Requested'];
            return (
              <>
                <tr
                  key={d.dimensionId}
                  onClick={() => setExpandedId(isOpen ? null : d.dimensionId)}
                  className={clsx('cursor-pointer transition', s.row)}
                >
                  <td className="py-3.5 px-4 text-slate-400 text-xs font-mono">{i + 1}</td>
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-slate-800">{d.dimensionLabel}</div>
                    <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">{d.summary}</div>
                  </td>
                  <td className="py-3.5 px-4">
                    <StatusBadge status={d.status as ComplianceStatus} />
                  </td>
                  <td className="py-3.5 px-4 hidden md:table-cell">
                    <span className="text-xs text-slate-600 line-clamp-2">
                      {d.issues[0] ?? '—'}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-400 text-center">
                    <svg
                      className={clsx('w-4 h-4 transition-transform inline', isOpen && 'rotate-180')}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </td>
                </tr>
                {isOpen && <ExpandedRow key={`${d.dimensionId}-exp`} d={d} />}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
