/**
 * PDF report generator — ESG Retail Bias Scanner (EU Retail Edition)
 *
 * Template sections:
 *   1. Cover / Retail Risk Summary  (primaryScore + conversionExposureLevel)
 *   2. Conversion Risk Page         (3 conversion-critical dimensions)
 *   3. Retail 8-Dimension Breakdown (scored weighted table)
 *   4. Legacy Inclusivity Findings  (from generic scanner — fallback)
 *   5. Evidence Appendix
 *   6. Disclaimers
 */
import * as fs from 'fs';
import * as path from 'path';
import type { Browser } from 'playwright';
import type { ScanRunResult, DimensionResult, EvidenceRecord, RetailRiskScore } from '../types/run';

// ─── Colour palette ───────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  Complies:              { bg: '#d1fae5', fg: '#065f46', border: '#34d399' },
  'Partially Complies':  { bg: '#fef3c7', fg: '#92400e', border: '#fbbf24' },
  'Does Not Comply':     { bg: '#fee2e2', fg: '#991b1b', border: '#f87171' },
  'Not Requested':       { bg: '#f3f4f6', fg: '#6b7280', border: '#d1d5db' },
  'Mixed / Multi-flow':  { bg: '#ede9fe', fg: '#5b21b6', border: '#a78bfa' },
};

const SCORE_COLOR = (s: number): string =>
  s >= 80 ? '#065f46' : s >= 50 ? '#b45309' : '#991b1b';

const SCORE_BG = (s: number): string =>
  s >= 80 ? '#d1fae5' : s >= 50 ? '#fef3c7' : '#fee2e2';

const RISK_LABEL = (s: number): string =>
  s >= 80 ? 'LOW RISK' : s >= 50 ? 'MEDIUM RISK' : 'HIGH RISK';

// ─── Score calculator (legacy fallback) ──────────────────────────────────────
function calcScore(dimensions: DimensionResult[]): number {
  const weights: Record<string, number> = {
    Complies:              100,
    'Partially Complies':   50,
    'Does Not Comply':       0,
    'Not Requested':        70,
    'Mixed / Multi-flow':   40,
  };
  const relevant = dimensions.filter((d) => d.status !== 'Not Requested');
  if (relevant.length === 0) return 100;
  const total = relevant.reduce((sum, d) => sum + (weights[d.status] ?? 50), 0);
  return Math.round(total / relevant.length);
}

/** Prefer primaryScore.overallScore; fall back to legacy dimension calc */
function resolveScore(result: ScanRunResult): number {
  return result.primaryScore?.overallScore ?? calcScore(result.dimensions);
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────
function esc(s: string | undefined | null): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Truncate a URL to fit in a narrow column */
function shortUrl(url: string, max = 45): string {
  try {
    const u = new URL(url);
    const display = u.hostname + u.pathname;
    return display.length > max ? display.slice(0, max - 1) + '\u2026' : display;
  } catch {
    return url.length > max ? url.slice(0, max - 1) + '\u2026' : url;
  }
}

/** Compact inline status badge */
function badge(status: string): string {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS['Not Requested'];
  return `<span style="display:inline-block;background:${c.bg};color:${c.fg};`
       + `border:1px solid ${c.border};padding:1px 6px;border-radius:10px;`
       + `font-size:8pt;font-weight:700;white-space:nowrap;">${esc(status)}</span>`;
}

/** 1–2 compact bullet items */
function bullets(items: string[], max = 2): string {
  const list = (items ?? []).filter(Boolean).slice(0, max);
  if (!list.length) return '<span style="color:#9ca3af;font-size:8pt;">\u2014</span>';
  return list
    .map((i) => `<div style="margin:1px 0;font-size:8pt;line-height:1.3;">\u2022 ${esc(i)}</div>`)
    .join('');
}

/** Three-column sales impact cell (Now / Future / Benefit) */
function salesImpactCell(d: DimensionResult): string {
  const col = (label: string, items: string[]): string =>
    `<div style="flex:1;padding:0 3px;border-right:1px solid #e5e7eb;min-width:0;">`
    + `<div style="font-size:7pt;font-weight:700;color:#9ca3af;text-transform:uppercase;`
    + `margin-bottom:2px;">${label}</div>`
    + bullets(items, 2)
    + `</div>`;

  return `<div style="display:flex;gap:0;">`
    + col('Now',    d.salesImpact?.now ?? [])
    + col('Future', d.salesImpact?.future ?? [])
    + `<div style="flex:1;padding:0 3px;min-width:0;">`
    + `<div style="font-size:7pt;font-weight:700;color:#9ca3af;text-transform:uppercase;`
    + `margin-bottom:2px;">Benefit</div>`
    + bullets(d.salesImpact?.benefitIfFixed ?? [], 2)
    + `</div></div>`;
}

/** Evidence links cell for one dimension */
function linksCell(d: DimensionResult, evidences: EvidenceRecord[]): string {
  const evs   = evidences.filter((e) => d.evidenceIds?.includes(e.id));
  const pages = [...new Set(evs.map((e) => e.pageUrl))].slice(0, 3);

  const pageLinks = pages
    .map((u) => `<div style="font-size:7pt;color:#2563eb;word-break:break-all;margin-bottom:1px;">`
               + esc(shortUrl(u, 38)) + `</div>`)
    .join('');

  const evIds = evs.slice(0, 3)
    .map((e) => `<div style="font-size:7pt;font-family:monospace;color:#6b7280;">`
               + esc(e.id.slice(3, 11)) + `\u2026 (${esc(e.type)})</div>`)
    .join('');

  return (pageLinks + evIds) || '<span style="font-size:8pt;color:#d1d5db;">\u2014</span>';
}

// ─── Section 1: Cover + Retail Risk Summary ──────────────────────────────────
function execSummarySection(result: ScanRunResult, score: number): string {
  const sColor = SCORE_COLOR(score);
  const sBg    = SCORE_BG(score);
  const risk   = result.primaryScore?.riskLevel ?? RISK_LABEL(score);

  // Conversion exposure pill
  const expLevel  = result.conversionExposureLevel ?? risk;
  const expScore  = result.conversionExposureScore ?? score;
  const expColor  = SCORE_COLOR(expScore);
  const expBg     = SCORE_BG(expScore);

  const byStatus = (s: string): number =>
    result.dimensions.filter((d) => d.status === s).length;

  const failing: DimensionResult[] = [
    ...result.dimensions.filter((d) => d.status === 'Does Not Comply'),
    ...result.dimensions.filter((d) => d.status === 'Partially Complies'),
  ];

  const top5 = failing.slice(0, 5).map((d) => ({
    label:  d.dimensionLabel,
    issue:  d.issues?.[0] ?? d.summary ?? 'See dimension detail',
    status: d.status,
  }));

  const topRows = top5.length
    ? top5.map((t) =>
        `<tr>`
        + `<td style="padding:5px 8px;font-size:8.5pt;font-weight:600;width:26%;`
        + `border-bottom:1px solid #f3f4f6;">${esc(t.label)}</td>`
        + `<td style="padding:5px 8px;width:20%;border-bottom:1px solid #f3f4f6;">${badge(t.status)}</td>`
        + `<td style="padding:5px 8px;font-size:8pt;color:#374151;`
        + `border-bottom:1px solid #f3f4f6;">${esc(t.issue)}</td>`
        + `</tr>`).join('')
    : `<tr><td colspan="3" style="padding:8px;font-size:8.5pt;color:#6b7280;">`
      + `No compliance gaps detected.</td></tr>`;

  const kpiCols = [
    ['Does Not Comply',    String(byStatus('Does Not Comply')),    '#fee2e2', '#991b1b'],
    ['Partially Complies', String(byStatus('Partially Complies')), '#fef3c7', '#b45309'],
    ['Complies',           String(byStatus('Complies')),           '#d1fae5', '#065f46'],
    ['Not Requested',      String(byStatus('Not Requested')),      '#f3f4f6', '#6b7280'],
  ] as const;

  const kpiHtml = kpiCols.map(([label, val, bg, fg]) =>
    `<div style="flex:1;padding:12px 16px;background:${bg};text-align:center;`
    + `border-right:1px solid #e5e7eb;">`
    + `<div style="font-size:22pt;font-weight:800;color:${fg};">${val}</div>`
    + `<div style="font-size:7pt;color:${fg};text-transform:uppercase;`
    + `letter-spacing:0.5px;margin-top:2px;">${label}</div>`
    + `</div>`).join('');

  return `
<div style="page-break-after:always;">

  <!-- Header bar -->
  <div style="background:#0f172a;color:#fff;padding:18px 28px 14px;
    display:flex;justify-content:space-between;align-items:center;">
    <div>
      <div style="font-size:8pt;letter-spacing:2px;text-transform:uppercase;
        opacity:0.5;margin-bottom:4px;">EU Retail eCommerce · Digital Risk Report</div>
      <div style="font-size:20pt;font-weight:800;letter-spacing:-0.5px;">
        Retail Inclusion &amp; Conversion Risk Audit</div>
    </div>
    <!-- Primary Score (Retail) -->
    <div style="display:flex;gap:14px;align-items:center;">
      <div style="text-align:center;">
        <div style="background:${sBg};color:${sColor};border:2px solid ${sColor};
          border-radius:50%;width:64px;height:64px;line-height:60px;text-align:center;
          font-size:22pt;font-weight:800;display:inline-block;">${score}</div>
        <div style="font-size:7.5pt;font-weight:700;color:${sColor};margin-top:3px;
          background:${sBg};padding:2px 8px;border-radius:10px;display:inline-block;">
          ${risk} RISK</div>
        <div style="font-size:7pt;color:#94a3b8;margin-top:2px;">Retail Score</div>
      </div>
      <!-- Conversion Exposure -->
      <div style="text-align:center;">
        <div style="background:${expBg};color:${expColor};border:2px solid ${expColor};
          border-radius:50%;width:52px;height:52px;line-height:48px;text-align:center;
          font-size:17pt;font-weight:800;display:inline-block;">${expScore}</div>
        <div style="font-size:7.5pt;font-weight:700;color:${expColor};margin-top:3px;
          background:${expBg};padding:2px 8px;border-radius:10px;display:inline-block;">
          ${expLevel}</div>
        <div style="font-size:7pt;color:#94a3b8;margin-top:2px;">Conversion Exposure</div>
      </div>
    </div>
  </div>

  <!-- Meta strip -->
  <div style="background:#f8fafc;border-bottom:1px solid #e2e8f0;
    padding:7px 28px;font-size:8pt;color:#64748b;display:flex;gap:24px;flex-wrap:wrap;">
    <span><strong style="color:#374151;">Site:</strong> ${esc(result.companyUrl)}</span>
    <span><strong style="color:#374151;">Market:</strong> EU Retail eCommerce (B2C Live)</span>
    <span><strong style="color:#374151;">Scanned:</strong>
      ${result.scannedAt ? result.scannedAt.slice(0, 16).replace('T', ' ') : '\u2014'}</span>
    <span><strong style="color:#374151;">Pages crawled:</strong>
      ${result.pagesScanned?.length ?? 0}</span>
    <span><strong style="color:#374151;">Run ID:</strong>
      <span style="font-family:monospace;">${esc(result.runId.slice(0, 8))}\u2026</span></span>
  </div>

  <!-- KPI row (legacy inclusivity dims) -->
  <div style="display:flex;border-bottom:1px solid #e2e8f0;">${kpiHtml}</div>

  <!-- Overall summary -->
  <div style="padding:14px 28px 10px;border-bottom:1px solid #f3f4f6;">
    <div style="font-size:9pt;font-weight:700;color:#0f172a;margin-bottom:6px;">
      Overall Assessment</div>
    <div style="font-size:9pt;color:#374151;line-height:1.5;
      background:#f8fafc;border-left:3px solid #3b82f6;padding:10px 14px;
      border-radius:0 6px 6px 0;">
      ${esc(result.salesImpactSummary)}</div>
  </div>

  <!-- Top 5 issues -->
  <div style="padding:12px 28px;">
    <div style="font-size:9pt;font-weight:700;color:#0f172a;margin-bottom:8px;">
      Top Issues Identified</div>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:5px 8px;font-size:8pt;text-align:left;font-weight:600;
            color:#6b7280;border-bottom:1px solid #e5e7eb;">Dimension</th>
          <th style="padding:5px 8px;font-size:8pt;text-align:left;font-weight:600;
            color:#6b7280;border-bottom:1px solid #e5e7eb;">Status</th>
          <th style="padding:5px 8px;font-size:8pt;text-align:left;font-weight:600;
            color:#6b7280;border-bottom:1px solid #e5e7eb;">Finding</th>
        </tr>
      </thead>
      <tbody>${topRows}</tbody>
    </table>
  </div>

</div>`;
}

// ─── Section 2: Conversion Risk Page (retail-specific) ────────────────────────
const RETAIL_DIM_LABELS: Record<string, string> = {
  checkoutFriction:              'Checkout Friction',
  paymentInclusivity:            'Payment Inclusivity',
  genderInclusion:               'Gender Inclusion',
  internationalizationFlexibility: 'Internationalisation',
  accessibilityBaseline:         'Accessibility (WCAG)',
  microcopyBias:                 'Microcopy Bias',
  visualRepresentation:          'Visual Representation',
  dataProportionality:           'Data Proportionality',
};

const RETAIL_DIM_WEIGHTS: Record<string, number> = {
  checkoutFriction:              0.18,
  paymentInclusivity:            0.15,
  genderInclusion:               0.18,
  internationalizationFlexibility: 0.15,
  accessibilityBaseline:         0.15,
  microcopyBias:                 0.07,
  visualRepresentation:          0.07,
  dataProportionality:           0.05,
};

const CONV_DIMS = new Set(['checkoutFriction', 'paymentInclusivity', 'genderInclusion']);

function retailScoreBar(score: number, width = 120): string {
  const fill = Math.round((score / 100) * width);
  const color = SCORE_COLOR(score);
  return `<div style="display:inline-flex;align-items:center;gap:6px;">
    <div style="width:${width}px;height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden;">
      <div style="width:${fill}px;height:100%;background:${color};border-radius:4px;"></div>
    </div>
    <span style="font-size:8pt;font-weight:700;color:${color};">${score}</span>
  </div>`;
}

function conversionRiskSection(result: ScanRunResult): string {
  if (!result.primaryScore) return '';

  const { breakdown } = result.primaryScore;
  const expScore  = result.conversionExposureScore ?? 0;
  const expLevel  = result.conversionExposureLevel ?? 'Unknown';
  const expColor  = SCORE_COLOR(expScore);
  const expBg     = SCORE_BG(expScore);

  const convDims = Object.entries(breakdown)
    .filter(([key]) => CONV_DIMS.has(key))
    .sort(([a], [b]) => (RETAIL_DIM_WEIGHTS[b] ?? 0) - (RETAIL_DIM_WEIGHTS[a] ?? 0));

  const convRows = convDims.map(([key, dim]) => {
    const label    = RETAIL_DIM_LABELS[key] ?? key;
    const weight   = Math.round((RETAIL_DIM_WEIGHTS[key] ?? 0) * 100);
    const topFinding = dim.findings[0] ?? 'No issues detected.';
    return `<tr style="border-bottom:1px solid #e5e7eb;page-break-inside:avoid;">
      <td style="padding:8px;font-size:9pt;font-weight:700;color:#0f172a;width:22%;">${esc(label)}</td>
      <td style="padding:8px;width:32%;">${retailScoreBar(dim.score)}</td>
      <td style="padding:8px;font-size:7pt;color:#6b7280;width:8%;text-align:center;">${weight}%</td>
      <td style="padding:8px;font-size:8pt;color:#374151;">${esc(topFinding)}</td>
    </tr>`;
  }).join('');

  return `
<div style="page-break-before:always;page-break-after:always;">

  <div style="background:#7c3aed;color:#fff;padding:10px 28px;font-size:10pt;
    font-weight:700;letter-spacing:0.3px;">Conversion Risk Analysis</div>

  <!-- Exposure headline -->
  <div style="padding:16px 28px;display:flex;gap:20px;align-items:center;
    border-bottom:1px solid #e5e7eb;">
    <div style="background:${expBg};border:2px solid ${expColor};border-radius:10px;
      padding:14px 24px;text-align:center;min-width:110px;">
      <div style="font-size:26pt;font-weight:900;color:${expColor};">${expScore}</div>
      <div style="font-size:8pt;font-weight:700;color:${expColor};margin-top:2px;">/ 100</div>
      <div style="font-size:7.5pt;color:${expColor};text-transform:uppercase;
        letter-spacing:0.5px;margin-top:4px;font-weight:700;">
        ${expLevel} EXPOSURE</div>
    </div>
    <div style="flex:1;">
      <div style="font-size:10pt;font-weight:700;color:#0f172a;margin-bottom:6px;">
        Estimated Conversion Exposure Level: <span style="color:${expColor};">${expLevel}</span></div>
      <div style="font-size:8.5pt;color:#374151;line-height:1.55;">
        This score measures the combined impact of the three conversion-critical 
        dimensions: <strong>Checkout Friction</strong>, <strong>Payment Inclusivity</strong>,
        and <strong>Gender Inclusion</strong>. These dimensions are weighted at 51% of the
        overall retail score because they directly correlate with cart abandonment,
        form drop-off, and purchase completion rates.
      </div>
      <div style="margin-top:8px;font-size:8pt;color:#64748b;">
        ${expLevel === 'Critical'
          ? '\u26a0\ufe0f Critical exposure may indicate significant revenue loss from exclusionary checkout or insufficient payment options.'
          : expLevel === 'High'
          ? '\u26a0\ufe0f High exposure suggests multiple friction points that are likely affecting your conversion funnel.'
          : expLevel === 'Medium'
          ? '\u2139\ufe0f Some conversion barriers detected. Addressing the findings below can meaningfully improve checkout completion.'
          : '\u2705 Conversion-critical dimensions appear well-optimised. Continue monitoring for regressions.'}
      </div>
    </div>
  </div>

  <!-- Conversion-critical dimension breakdown -->
  <div style="padding:12px 28px;">
    <div style="font-size:9pt;font-weight:700;color:#0f172a;margin-bottom:8px;">
      Conversion-Critical Dimension Scores</div>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#faf5ff;border-bottom:2px solid #7c3aed;">
          <th style="padding:6px 8px;font-size:8pt;font-weight:700;text-align:left;
            color:#374151;">Dimension</th>
          <th style="padding:6px 8px;font-size:8pt;font-weight:700;text-align:left;
            color:#374151;">Score</th>
          <th style="padding:6px 8px;font-size:8pt;font-weight:700;text-align:center;
            color:#374151;">Weight</th>
          <th style="padding:6px 8px;font-size:8pt;font-weight:700;text-align:left;
            color:#374151;">Top Finding</th>
        </tr>
      </thead>
      <tbody>${convRows}</tbody>
    </table>
  </div>

</div>`;
}

// ─── Section 3: Retail 8-Dimension Breakdown ──────────────────────────────────
function retailBreakdownSection(primaryScore: RetailRiskScore): string {
  const { breakdown } = primaryScore;

  const dimensionOrder = [
    'checkoutFriction', 'paymentInclusivity', 'genderInclusion',
    'internationalizationFlexibility', 'accessibilityBaseline',
    'microcopyBias', 'visualRepresentation', 'dataProportionality',
  ];

  const rows = dimensionOrder.map((key) => {
    const dim    = breakdown[key];
    if (!dim) return '';
    const label  = RETAIL_DIM_LABELS[key] ?? key;
    const weight = Math.round((RETAIL_DIM_WEIGHTS[key] ?? 0) * 100);
    const isConv = CONV_DIMS.has(key);
    const rowBg  = isConv ? 'background:#faf5ff;' : '';

    const findingsList = (dim.findings ?? [])
      .filter((f) => !/no .* issues detected|no .* bias detected|appears/i.test(f))
      .slice(0, 3);

    return `<tr style="border-bottom:1px solid #e5e7eb;page-break-inside:avoid;${rowBg}">
      <td style="padding:8px;vertical-align:top;width:16%;">
        <div style="font-size:8.5pt;font-weight:700;color:#0f172a;">${esc(label)}</div>
        ${isConv ? `<div style="font-size:7pt;color:#7c3aed;margin-top:2px;">\u26a1 Conversion-critical</div>` : ''}
        <div style="font-size:7pt;color:#9ca3af;margin-top:1px;">Weight: ${weight}%</div>
      </td>
      <td style="padding:8px;vertical-align:top;width:22%;">
        ${retailScoreBar(dim.score)}
        <div style="margin-top:4px;font-size:8pt;color:${SCORE_COLOR(dim.score)};font-weight:600;">
          ${RISK_LABEL(dim.score)}</div>
      </td>
      <td style="padding:8px;vertical-align:top;">
        ${findingsList.length
          ? findingsList.map((f) => `<div style="font-size:7.5pt;color:#374151;margin-bottom:3px;">\u2022 ${esc(f)}</div>`).join('')
          : `<div style="font-size:7.5pt;color:#16a34a;">\u2713 No issues detected</div>`}
      </td>
    </tr>`;
  }).join('');

  return `
<div style="page-break-before:always;">

  <div style="background:#0f172a;color:#fff;padding:10px 28px;font-size:10pt;
    font-weight:700;letter-spacing:0.3px;">Retail 8-Dimension Risk Breakdown</div>

  <div style="padding:8px 28px 4px;font-size:8pt;color:#64748b;border-bottom:1px solid #e5e7eb;">
    Scores are deterministic (0\u2013100). Higher = lower risk. 
    \u26a1 marks conversion-critical dimensions weighted at 18%, 15%, 18% respectively.
    Overall weighted retail score: <strong style="color:${SCORE_COLOR(primaryScore.overallScore)};">
    ${primaryScore.overallScore} / 100 (${primaryScore.riskLevel})</strong>
  </div>

  <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
    <colgroup>
      <col style="width:18%;"/>
      <col style="width:22%;"/>
      <col style="width:60%;"/>
    </colgroup>
    <thead>
      <tr style="background:#f8fafc;border-bottom:2px solid #0f172a;">
        <th style="padding:7px 8px;text-align:left;font-size:8pt;font-weight:700;
          color:#374151;border-right:1px solid #e5e7eb;">Dimension</th>
        <th style="padding:7px 8px;text-align:left;font-size:8pt;font-weight:700;
          color:#374151;border-right:1px solid #e5e7eb;">Score</th>
        <th style="padding:7px 8px;text-align:left;font-size:8pt;font-weight:700;
          color:#374151;">Findings</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

</div>`;
}

// ─── Section 4: Legacy Dimension Table (inclusivity findings) ─────────────────
function dimensionTableSection(result: ScanRunResult): string {
  const rows = result.dimensions.map((d) => {
    const c               = STATUS_COLORS[d.status] ?? STATUS_COLORS['Not Requested'];
    const goodPractice    = d.actualVsGoodPractice?.goodPractice ?? '';
    const brandExamples   = d.actualVsGoodPractice?.brandExamples ?? [];
    const currentBullets  = d.issues?.length
      ? d.issues
      : [d.actualVsGoodPractice?.actualBehavior ?? d.summary ?? ''];

    return `<tr style="border-bottom:1px solid #e5e7eb;page-break-inside:avoid;">`

      // Dimension + Status
      + `<td style="padding:7px 8px;vertical-align:top;background:${c.bg}25;`
      + `border-right:1px solid #e5e7eb;">`
      + `<div style="font-size:8.5pt;font-weight:700;color:#0f172a;margin-bottom:3px;">`
      + esc(d.dimensionLabel) + `</div>`
      + badge(d.status)
      + `</td>`

      // Current behaviour / Issues
      + `<td style="padding:7px 8px;vertical-align:top;border-right:1px solid #e5e7eb;">`
      + `<div style="font-size:7pt;font-weight:700;color:#9ca3af;text-transform:uppercase;`
      + `margin-bottom:2px;">Current</div>`
      + bullets(currentBullets, 2)
      + `</td>`

      // Good Practice
      + `<td style="padding:7px 8px;vertical-align:top;border-right:1px solid #e5e7eb;">`
      + `<div style="font-size:7pt;font-weight:700;color:#9ca3af;text-transform:uppercase;`
      + `margin-bottom:2px;">Good Practice</div>`
      + `<div style="font-size:8pt;color:#374151;line-height:1.35;">${esc(goodPractice)}</div>`
      + (brandExamples.length
          ? `<div style="font-size:7pt;color:#2563eb;margin-top:3px;">\u2713 `
            + brandExamples.slice(0, 2).map(esc).join(' &nbsp;\u00b7&nbsp; ')
            + `</div>`
          : '')
      + `</td>`

      // Sales Impact
      + `<td style="padding:7px 8px;vertical-align:top;border-right:1px solid #e5e7eb;">`
      + `<div style="font-size:7pt;font-weight:700;color:#9ca3af;text-transform:uppercase;`
      + `margin-bottom:2px;">Sales Impact</div>`
      + salesImpactCell(d)
      + `</td>`

      // Links / Evidence
      + `<td style="padding:7px 8px;vertical-align:top;">`
      + `<div style="font-size:7pt;font-weight:700;color:#9ca3af;text-transform:uppercase;`
      + `margin-bottom:2px;">Evidence</div>`
      + linksCell(d, result.evidences ?? [])
      + `</td>`

      + `</tr>`;
  });

  return `
<div style="page-break-before:always;">

  <div style="background:#0f172a;color:#fff;padding:10px 28px;font-size:10pt;
    font-weight:700;letter-spacing:0.3px;">Inclusivity Findings (Legacy Dimension Analysis)</div>

  <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
    <colgroup>
      <col style="width:15%;"/>
      <col style="width:18%;"/>
      <col style="width:22%;"/>
      <col style="width:28%;"/>
      <col style="width:17%;"/>
    </colgroup>
    <thead>
      <tr style="background:#f8fafc;border-bottom:2px solid #0f172a;">
        <th style="padding:7px 8px;text-align:left;font-size:8pt;font-weight:700;
          color:#374151;border-right:1px solid #e5e7eb;">Dimension</th>
        <th style="padding:7px 8px;text-align:left;font-size:8pt;font-weight:700;
          color:#374151;border-right:1px solid #e5e7eb;">Current Behaviour</th>
        <th style="padding:7px 8px;text-align:left;font-size:8pt;font-weight:700;
          color:#374151;border-right:1px solid #e5e7eb;">Good Practice</th>
        <th style="padding:7px 8px;text-align:left;font-size:8pt;font-weight:700;
          color:#374151;border-right:1px solid #e5e7eb;">Sales Impact</th>
        <th style="padding:7px 8px;text-align:left;font-size:8pt;font-weight:700;
          color:#374151;">Links / Evidence</th>
      </tr>
    </thead>
    <tbody>${rows.join('\n')}</tbody>
  </table>

</div>`;
}

// ─── Section 3: Evidence Appendix ────────────────────────────────────────────
function evidenceAppendix(evidences: EvidenceRecord[]): string {
  if (!evidences?.length) return '';

  const rows = evidences.map((e) => {
    const typeBg = e.type === 'screenshot' ? '#dbeafe' : '#fce7f3';
    const typeFg = e.type === 'screenshot' ? '#1e40af' : '#9d174d';
    return `<tr style="border-bottom:1px solid #f3f4f6;">`
      + `<td style="padding:5px 8px;font-family:monospace;font-size:8pt;white-space:nowrap;">`
      + esc(e.id.slice(3, 11)) + `\u2026</td>`
      + `<td style="padding:5px 8px;">`
      + `<span style="background:${typeBg};color:${typeFg};padding:1px 6px;`
      + `border-radius:8px;font-size:7.5pt;font-weight:600;">${esc(e.type)}</span></td>`
      + `<td style="padding:5px 8px;font-size:7.5pt;color:#2563eb;word-break:break-all;">`
      + esc(shortUrl(e.pageUrl, 55)) + `</td>`
      + `<td style="padding:5px 8px;font-size:7.5pt;font-family:monospace;color:#6b7280;`
      + `word-break:break-all;">${esc(path.basename(e.filePath))}</td>`
      + `<td style="padding:5px 8px;font-size:7.5pt;color:#6b7280;">`
      + esc((e.capturedAt ?? '').slice(0, 16).replace('T', ' ')) + `</td>`
      + `</tr>`;
  });

  return `
<div style="page-break-before:always;">

  <div style="background:#0f172a;color:#fff;padding:10px 28px;font-size:10pt;
    font-weight:700;letter-spacing:0.3px;">Evidence Appendix</div>

  <div style="padding:12px 28px;">
    <p style="font-size:8.5pt;color:#6b7280;margin:0 0 10px;">
      ${evidences.length} evidence item(s) captured during this scan.
      Files are stored relative to the run directory.
    </p>
    <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
      <colgroup>
        <col style="width:12%;"/>
        <col style="width:10%;"/>
        <col style="width:35%;"/>
        <col style="width:28%;"/>
        <col style="width:15%;"/>
      </colgroup>
      <thead>
        <tr style="background:#f8fafc;border-bottom:2px solid #e5e7eb;">
          <th style="padding:5px 8px;text-align:left;font-size:8pt;font-weight:700;
            color:#374151;">Evidence ID</th>
          <th style="padding:5px 8px;text-align:left;font-size:8pt;font-weight:700;
            color:#374151;">Type</th>
          <th style="padding:5px 8px;text-align:left;font-size:8pt;font-weight:700;
            color:#374151;">Page URL</th>
          <th style="padding:5px 8px;text-align:left;font-size:8pt;font-weight:700;
            color:#374151;">Local File</th>
          <th style="padding:5px 8px;text-align:left;font-size:8pt;font-weight:700;
            color:#374151;">Captured</th>
        </tr>
      </thead>
      <tbody>${rows.join('\n')}</tbody>
    </table>
  </div>

</div>`;
}

// ─── Section 4: Disclaimers ───────────────────────────────────────────────────
function disclaimerSection(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `
<div style="margin-top:24px;padding:14px 28px 18px;
  border-top:2px solid #e2e8f0;page-break-inside:avoid;">

  <div style="font-size:8pt;font-weight:700;color:#374151;margin-bottom:8px;
    text-transform:uppercase;letter-spacing:0.5px;">Important Disclaimers</div>

  <div style="display:flex;gap:10px;">

    <div style="flex:1;background:#fefce8;border:1px solid #fde68a;border-radius:6px;
      padding:9px 11px;font-size:7.5pt;color:#78350f;line-height:1.45;">
      <strong>Approximate Scoring</strong><br/>
      The inclusivity score and visual diversity rating are heuristic estimates derived
      from automated analysis. They do not constitute a certified accessibility or equity
      audit. All findings must be validated by qualified inclusivity and accessibility
      specialists before acting on them.
    </div>

    <div style="flex:1;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;
      padding:9px 11px;font-size:7.5pt;color:#7f1d1d;line-height:1.45;">
      <strong>No Identity Inference</strong><br/>
      Visual diversity analysis is based exclusively on publicly available image alt-text,
      captions, and ARIA labels. This tool applies no computer vision, facial recognition,
      or biometric analysis. No individual is identified, classified, or profiled at any
      stage of the scan.
    </div>

    <div style="flex:1;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;
      padding:9px 11px;font-size:7.5pt;color:#1e3a8a;line-height:1.45;">
      <strong>Discovery Scope</strong><br/>
      Results depend entirely on the pages discovered during the crawl. The scanner
      respects robots.txt and is bounded by the configured depth and page cap.
      Pages behind authentication, CAPTCHA, or complex SPA navigation may not be
      reached. A complete audit must include manual testing of all authenticated flows.
    </div>

  </div>

  <div style="margin-top:10px;font-size:7pt;color:#9ca3af;text-align:center;">
    Generated by ESG Retail Bias Scanner \u00b7 Report date: ${today} \u00b7
    For internal use only \u2014 not for redistribution without specialist review.
  </div>

</div>`;
}

// ─── Full HTML assembler ──────────────────────────────────────────────────────
export function buildHtml(result: ScanRunResult): string {
  const score = resolveScore(result);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>EU Retail Risk Report \u2014 ${esc(result.companyUrl)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      font-size: 10pt; color: #111827; background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    @page { size: A4 portrait; margin: 10mm 10mm 14mm; }
    @media print { body { font-size: 9pt; } }
    table { border-collapse: collapse; }
  </style>
</head>
<body>
${execSummarySection(result, score)}
${result.primaryScore ? conversionRiskSection(result) : ''}
${result.primaryScore ? retailBreakdownSection(result.primaryScore) : ''}
${dimensionTableSection(result)}
${evidenceAppendix(result.evidences ?? [])}
${disclaimerSection()}
</body>
</html>`;
}

// ─── PDF generator ────────────────────────────────────────────────────────────
/**
 * Build HTML, write report.html, render to report.pdf via Playwright.
 * Returns the absolute path of the saved PDF.
 */
export async function generatePdfReport(
  result: ScanRunResult,
  runDir: string,
  browser: Browser,
): Promise<string> {
  fs.mkdirSync(runDir, { recursive: true });

  const html    = buildHtml(result);
  const htmlPath = path.join(runDir, 'report.html');
  const pdfPath  = path.join(runDir, 'report.pdf');

  // Always write the HTML (useful for web-preview endpoint)
  fs.writeFileSync(htmlPath, html, 'utf-8');

  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle' });
    // Give system fonts a moment to load before capturing
    await page.waitForTimeout(300);
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', bottom: '14mm', left: '10mm', right: '10mm' },
    });
  } finally {
    await page.close().catch(() => {});
  }

  return pdfPath;
}

/**
 * Re-generate HTML + PDF from an existing report.json on disk.
 * Accepts an already-open Browser so callers can share one instance.
 */
export async function regenerateReport(
  runDir: string,
  browser: Browser,
): Promise<{ htmlPath: string; pdfPath: string }> {
  const reportJsonPath = path.join(runDir, 'report.json');
  if (!fs.existsSync(reportJsonPath)) {
    throw new Error(`report.json not found in ${runDir}`);
  }
  const result: ScanRunResult = JSON.parse(fs.readFileSync(reportJsonPath, 'utf-8'));
  const pdfPath = await generatePdfReport(result, runDir, browser);
  return {
    htmlPath: path.join(runDir, 'report.html'),
    pdfPath,
  };
}


