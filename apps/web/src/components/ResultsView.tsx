'use client';

import clsx from 'clsx';
import type {
  ScanRunResult,
  ComplianceStatus,
  RetailRiskLevel,
} from '@/lib/types';
import { pdfDownloadUrl, htmlPreviewUrl } from '@/lib/api';
import { DimensionTable } from './DimensionTable';

interface ResultsViewProps {
  result: ScanRunResult;
  onReset: () => void;
}

// ─── Score helpers ─────────────────────────────────────────────────────────────
function calcLegacyScore(dimensions: ScanRunResult['dimensions']): number {
  if (!dimensions.length) return 0;
  const W: Record<ComplianceStatus, number> = {
    Complies: 100,
    'Partially Complies': 50,
    'Does Not Comply': 0,
    'Not Requested': 70,
    'Mixed / Multi-flow': 40,
  };
  const total = dimensions.reduce(
    (sum, d) => sum + (W[d.status as ComplianceStatus] ?? 0),
    0,
  );
  return Math.round(total / dimensions.length);
}

function resolveScore(result: ScanRunResult): number {
  return result.primaryScore?.overallScore ?? calcLegacyScore(result.dimensions);
}

const SCORE_COLOR = (s: number) =>
  s >= 80 ? 'text-green-600' : s >= 50 ? 'text-amber-500' : 'text-red-600';

const RISK_LEVEL_COLOR: Record<RetailRiskLevel, string> = {
  Low: 'text-green-600',
  Medium: 'text-amber-500',
  High: 'text-red-500',
  Critical: 'text-red-700',
};
const RISK_LEVEL_BADGE: Record<RetailRiskLevel, string> = {
  Low: 'bg-green-100 text-green-700',
  Medium: 'bg-amber-100 text-amber-700',
  High: 'bg-red-100 text-red-700',
  Critical: 'bg-red-200 text-red-900',
};

function getRetailBadge(level?: RetailRiskLevel): string {
  if (!level) return 'bg-slate-100 text-slate-600';
  return RISK_LEVEL_BADGE[level];
}

function getRiskLabel(result: ScanRunResult, score: number): string {
  if (result.primaryScore?.riskLevel) return result.primaryScore.riskLevel.toUpperCase() + ' RISK';
  return score >= 80 ? 'LOW RISK' : score >= 50 ? 'MEDIUM RISK' : 'HIGH RISK';
}

// ─── KPI pill ──────────────────────────────────────────────────────────────────
function KpiPill({
  label,
  count,
  bg,
  text,
}: {
  label: string;
  count: number;
  bg: string;
  text: string;
}) {
  return (
    <div className={clsx('rounded-xl py-3.5 px-3 text-center', bg)}>
      <div className={clsx('text-3xl font-black', text)}>{count}</div>
      <div className={clsx('text-xs font-semibold mt-0.5', text)}>{label}</div>
    </div>
  );
}

// ─── Retail 8-dimension breakdown ─────────────────────────────────────────────
const RETAIL_DIM_LABELS: Record<string, string> = {
  genderInclusion:               'Gender Inclusion',
  internationalizationFlexibility: 'Internationalisation',
  checkoutFriction:              'Checkout Friction',
  paymentInclusivity:            'Payment Inclusivity',
  accessibilityBaseline:         'Accessibility',
  microcopyBias:                 'Microcopy & Tone',
  visualRepresentation:          'Visual Representation',
  dataProportionality:           'Data Proportionality',
};

const CONV_DIMS = new Set(['checkoutFriction', 'paymentInclusivity', 'internationalizationFlexibility']);

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 80 ? 'bg-green-500' : score >= 50 ? 'bg-amber-400' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={clsx('h-full rounded-full', color)} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-bold tabular-nums text-slate-700 w-7 text-right">{score}</span>
    </div>
  );
}

function RetailBreakdown({ result }: { result: ScanRunResult }) {
  const { primaryScore } = result;
  if (!primaryScore) return null;

  const dims = Object.entries(primaryScore.breakdown).sort(([, a], [, b]) => a.score - b.score);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-base font-bold text-slate-800">
          EU Retail — 8-Dimension Risk Breakdown
        </h3>
        <span className="text-xs text-slate-400 font-medium">Lower score = higher risk</span>
      </div>
      <div className="divide-y divide-slate-100">
        {dims.map(([key, dim]) => (
          <div key={key} className="px-6 py-3.5">
            <div className="flex items-center gap-3 mb-1.5">
              <span className="text-sm font-semibold text-slate-700 flex-1">
                {RETAIL_DIM_LABELS[key] ?? key}
              </span>
              {CONV_DIMS.has(key) && (
                <span className="text-[10px] font-bold uppercase tracking-wide bg-violet-100 text-violet-700 px-2 py-0.5 rounded">
                  Conversion
                </span>
              )}
            </div>
            <ScoreBar score={dim.score} />
            {dim.findings.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {dim.findings.map((f, i) => (
                  <li key={i} className="text-xs text-slate-500 flex gap-1.5">
                    <span className="text-slate-300 mt-px">•</span>
                    {f}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Conversion exposure card ─────────────────────────────────────────────────
function ConversionExposureCard({ result }: { result: ScanRunResult }) {
  const { conversionExposureScore, conversionExposureLevel } = result;
  if (conversionExposureScore === undefined || !conversionExposureLevel) return null;

  const badgeCls = RISK_LEVEL_BADGE[conversionExposureLevel];
  const scoreCls = RISK_LEVEL_COLOR[conversionExposureLevel];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-1">
            Conversion Exposure
          </div>
          <p className="text-sm text-slate-600 max-w-sm">
            Weighted risk across checkout friction, payment inclusivity, and
            internationalisation — the three dimensions most directly linked to
            conversion loss.
          </p>
        </div>
        <div className="flex-shrink-0 text-center">
          <div className={clsx('text-4xl font-black tabular-nums', scoreCls)}>
            {conversionExposureScore}
          </div>
          <div className="text-xs text-slate-400 font-medium">/100</div>
          <span className={clsx('mt-1 inline-block text-xs font-black px-3 py-1 rounded-full uppercase tracking-wide', badgeCls)}>
            {conversionExposureLevel}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function ResultsView({ result, onReset }: ResultsViewProps) {
  const score = resolveScore(result);
  const isRetail = !!result.primaryScore;
  const riskLabel = getRiskLabel(result, score);
  const riskBadgeCls = result.primaryScore?.riskLevel
    ? getRetailBadge(result.primaryScore.riskLevel)
    : score >= 80
    ? 'bg-green-100 text-green-700'
    : score >= 50
    ? 'bg-amber-100 text-amber-700'
    : 'bg-red-100 text-red-700';

  const scanDate = new Date(result.completedAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const counts = {
    complies: result.dimensions.filter((d) => d.status === 'Complies').length,
    partial: result.dimensions.filter((d) => d.status === 'Partially Complies').length,
    fails: result.dimensions.filter((d) => d.status === 'Does Not Comply').length,
    notRequested: result.dimensions.filter((d) => d.status === 'Not Requested').length,
  };

  const pdfUrl = pdfDownloadUrl(result.runId);
  const htmlUrl = htmlPreviewUrl(result.runId);

  return (
    <div className="space-y-6">
      {/* ── Score card ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
          {/* Left: meta */}
          <div className="min-w-0">
            <div className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-1">
              Scan Complete
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-1 truncate">{result.companyUrl}</h2>
            <p className="text-sm text-slate-500">
              {scanDate} · {result.pagesScanned.length} pages · Run{' '}
              <code className="font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-xs">
                {result.runId.slice(0, 8)}
              </code>
            </p>
            {isRetail && (
              <div className="mt-2">
                <span className="text-xs font-bold tracking-wide uppercase bg-violet-100 text-violet-700 px-2.5 py-1 rounded-full">
                  EU Retail eCommerce
                </span>
              </div>
            )}
          </div>

          {/* Right: score circle */}
          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="text-center">
              <div className={clsx('text-5xl font-black tabular-nums', SCORE_COLOR(score))}>
                {score}
              </div>
              <div className="text-xs text-slate-400 font-medium">/100</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {isRetail ? 'Retail Score' : 'Inclusivity Score'}
              </div>
            </div>
            <span
              className={clsx(
                'text-xs font-black px-3 py-1.5 rounded-full uppercase tracking-wide',
                riskBadgeCls,
              )}
            >
              {riskLabel}
            </span>
          </div>
        </div>

        {/* KPI row — only meaningful for legacy generic dimensions */}
        {!isRetail && (
          <div className="mt-6 grid grid-cols-4 gap-3">
            <KpiPill label="Complies"  count={counts.complies}     bg="bg-green-50" text="text-green-700" />
            <KpiPill label="Partial"   count={counts.partial}      bg="bg-amber-50" text="text-amber-700" />
            <KpiPill label="Fails"     count={counts.fails}        bg="bg-red-50"   text="text-red-700" />
            <KpiPill label="Not req."  count={counts.notRequested} bg="bg-slate-50" text="text-slate-600" />
          </div>
        )}

        {/* Sales impact summary */}
        {result.salesImpactSummary && (
          <div className="mt-5 bg-blue-50 border-l-4 border-blue-400 rounded-r-xl p-4 text-sm text-blue-900 leading-relaxed">
            {result.salesImpactSummary}
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href={pdfUrl}
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl px-5 py-2.5 text-sm transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Download PDF Report
          </a>
          <a
            href={htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-white border border-brand-300 hover:border-brand-500 text-brand-700 font-semibold rounded-xl px-5 py-2.5 text-sm transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
            Preview HTML
          </a>
          <button
            onClick={onReset}
            className="inline-flex items-center gap-2 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 font-semibold rounded-xl px-5 py-2.5 text-sm transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            New Scan
          </button>
        </div>
      </div>

      {/* ── Conversion Exposure card (retail only) ──────────────────────── */}
      <ConversionExposureCard result={result} />

      {/* ── EU Retail 8-dimension breakdown (retail only) ──────────────── */}
      <RetailBreakdown result={result} />

      {/* ── Legacy dimension table ─────────────────────────────────────── */}
      <div>
        <h3 className="text-base font-bold text-slate-800 mb-3">
          {isRetail ? 'Inclusivity Findings (Legacy Analysis)' : 'Dimension Findings'}
          <span className="text-xs font-normal text-slate-400 ml-2">
            Click a row to expand details
          </span>
        </h3>
        <DimensionTable dimensions={result.dimensions} />
      </div>

      {/* ── Evidence appendix ──────────────────────────────────────────── */}
      {result.evidences.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-base font-bold text-slate-800 mb-4">
            Evidence ({result.evidences.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="text-left py-2 pr-4 font-semibold">#</th>
                  <th className="text-left py-2 pr-4 font-semibold">Type</th>
                  <th className="text-left py-2 pr-4 font-semibold">Description</th>
                  <th className="text-left py-2 pr-4 font-semibold">Page</th>
                  <th className="text-left py-2 font-semibold">Captured</th>
                </tr>
              </thead>
              <tbody>
                {result.evidences.map((ev, i) => (
                  <tr key={ev.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 pr-4 text-slate-400 font-mono">{i + 1}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={clsx(
                          'text-xs font-semibold px-2 py-0.5 rounded',
                          ev.type === 'screenshot'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-violet-100 text-violet-700',
                        )}
                      >
                        {ev.type}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-slate-600 max-w-[240px] truncate">
                      {ev.description}
                    </td>
                    <td className="py-2 pr-4 max-w-[200px]">
                      <a
                        href={ev.pageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-600 hover:underline truncate block"
                        title={ev.pageUrl}
                      >
                        {new URL(ev.pageUrl).hostname}
                      </a>
                    </td>
                    <td className="py-2 text-slate-400 whitespace-nowrap">
                      {new Date(ev.capturedAt).toLocaleTimeString('en-GB')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
