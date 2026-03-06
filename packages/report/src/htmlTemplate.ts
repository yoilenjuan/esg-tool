import { ScanRun, DimensionFinding, ComplianceStatus } from '@esg/shared';

const STATUS_COLOR: Record<ComplianceStatus, string> = {
  'Complies': '#16a34a',
  'Partially Complies': '#d97706',
  'Does Not Comply': '#dc2626',
  'Not Requested': '#6b7280',
  'Mixed / Multi-flow': '#7c3aed',
};

const STATUS_BG: Record<ComplianceStatus, string> = {
  'Complies': '#dcfce7',
  'Partially Complies': '#fef3c7',
  'Does Not Comply': '#fee2e2',
  'Not Requested': '#f3f4f6',
  'Mixed / Multi-flow': '#ede9fe',
};

const statusBadge = (status: ComplianceStatus) =>
  `<span style="background:${STATUS_BG[status]};color:${STATUS_COLOR[status]};padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;white-space:nowrap;">${status}</span>`;

const scoreColor = (score: number) =>
  score >= 75 ? '#16a34a' : score >= 50 ? '#d97706' : '#dc2626';

function dimensionRows(findings: DimensionFinding[]): string {
  return findings
    .map(
      (f) => `
    <tr style="border-bottom:1px solid #e5e7eb;">
      <td style="padding:10px 8px;font-weight:600;color:#1e293b;">${f.dimensionLabel}</td>
      <td style="padding:10px 8px;">${statusBadge(f.status)}</td>
      <td style="padding:10px 8px;color:#374151;font-size:13px;">${f.issueSummary}</td>
    </tr>`
    )
    .join('');
}

function findingsDetail(findings: DimensionFinding[]): string {
  return findings
    .map(
      (f) => `
    <div style="margin-bottom:28px;page-break-inside:avoid;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
        <h3 style="margin:0;color:#1e293b;font-size:16px;">${f.dimensionLabel}</h3>
        ${statusBadge(f.status)}
      </div>
      ${
        f.issues.length > 0
          ? `<div style="margin-bottom:8px;">
              <strong style="color:#374151;font-size:13px;">Issues detected:</strong>
              <ul style="margin:4px 0 0 0;padding-left:20px;color:#374151;font-size:13px;">
                ${f.issues.map((i) => `<li style="margin-bottom:3px;">${i}</li>`).join('')}
              </ul>
            </div>`
          : ''
      }
      <div style="margin-bottom:8px;">
        <strong style="color:#374151;font-size:13px;">Recommendations:</strong>
        <ul style="margin:4px 0 0 0;padding-left:20px;color:#374151;font-size:13px;">
          ${f.recommendations.map((r) => `<li style="margin-bottom:3px;">${r}</li>`).join('')}
        </ul>
      </div>
      <div style="background:#f8fafc;border-left:3px solid #6366f1;padding:10px 14px;border-radius:4px;margin-bottom:8px;">
        <strong style="color:#374151;font-size:12px;">🏆 Good practice examples:</strong>
        <p style="margin:4px 0 0 0;color:#4b5563;font-size:12px;">${f.goodPracticeExamples.join(' · ')}</p>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px;">
        <div style="background:#fef2f2;border-radius:6px;padding:10px;font-size:12px;">
          <strong style="color:#991b1b;display:block;margin-bottom:4px;">⚠️ Current Impact</strong>
          <span style="color:#7f1d1d;">${f.salesImpact.currentImpact}</span>
        </div>
        <div style="background:#fff7ed;border-radius:6px;padding:10px;font-size:12px;">
          <strong style="color:#9a3412;display:block;margin-bottom:4px;">🔮 Future Impact</strong>
          <span style="color:#7c2d12;">${f.salesImpact.futureImpact}</span>
        </div>
        <div style="background:#f0fdf4;border-radius:6px;padding:10px;font-size:12px;">
          <strong style="color:#166534;display:block;margin-bottom:4px;">✅ Benefit if Resolved</strong>
          <span style="color:#14532d;">${f.salesImpact.benefitIfResolved}</span>
        </div>
      </div>
    </div>`
    )
    .join('');
}

function evidenceSection(run: ScanRun): string {
  if (run.evidence.length === 0) return '<p style="color:#6b7280;font-size:13px;">No evidence captured.</p>';
  return `
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th style="padding:8px;text-align:left;border-bottom:2px solid #e2e8f0;">#</th>
          <th style="padding:8px;text-align:left;border-bottom:2px solid #e2e8f0;">Type</th>
          <th style="padding:8px;text-align:left;border-bottom:2px solid #e2e8f0;">Description</th>
          <th style="padding:8px;text-align:left;border-bottom:2px solid #e2e8f0;">Page URL</th>
          <th style="padding:8px;text-align:left;border-bottom:2px solid #e2e8f0;">File</th>
        </tr>
      </thead>
      <tbody>
        ${run.evidence
          .map(
            (e, i) => `
          <tr style="border-bottom:1px solid #e5e7eb;">
            <td style="padding:7px 8px;color:#6b7280;">${i + 1}</td>
            <td style="padding:7px 8px;font-weight:600;">${e.type}</td>
            <td style="padding:7px 8px;color:#374151;">${e.description}</td>
            <td style="padding:7px 8px;color:#374151;word-break:break-all;max-width:200px;">
              <a href="${e.pageUrl}" style="color:#4f46e5;">${e.pageUrl}</a>
            </td>
            <td style="padding:7px 8px;color:#374151;font-family:monospace;">${e.filePath}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
}

export function buildHtmlReport(run: ScanRun): string {
  const scanDate = new Date(run.startedAt).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  const score = run.overallScore;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ESG Retail Bias Scanner – Report</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: #fff; color: #1e293b; }
    .page { max-width: 860px; margin: 0 auto; padding: 40px 48px; }
    h1 { margin: 0 0 4px 0; font-size: 26px; color: #0f172a; }
    h2 { font-size: 18px; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin: 32px 0 16px 0; }
    table { width: 100%; border-collapse: collapse; }
    @media print { .page { padding: 20px; } }
  </style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:20px;border-bottom:3px solid #4f46e5;">
    <div>
      <div style="color:#6366f1;font-size:12px;font-weight:700;letter-spacing:2px;margin-bottom:6px;">ESG RETAIL BIAS SCANNER</div>
      <h1>Inclusivity & Bias Report</h1>
      <div style="color:#64748b;font-size:13px;margin-top:4px;">
        <strong>Target:</strong> ${run.options.url}<br/>
        <strong>Scan date:</strong> ${scanDate} &nbsp;·&nbsp;
        <strong>Run ID:</strong> <code style="font-size:11px;">${run.runId}</code><br/>
        <strong>Depth:</strong> ${run.options.depth} &nbsp;·&nbsp;
        <strong>Pages scanned:</strong> ${run.pagesScanned.length}
      </div>
    </div>
    <div style="text-align:center;background:#f8fafc;border-radius:12px;padding:16px 24px;border:2px solid #e2e8f0;">
      <div style="font-size:11px;color:#64748b;font-weight:600;letter-spacing:1px;margin-bottom:4px;">OVERALL SCORE</div>
      <div style="font-size:48px;font-weight:900;color:${scoreColor(score)};line-height:1;">${score}</div>
      <div style="font-size:11px;color:#64748b;">/ 100</div>
    </div>
  </div>

  <!-- Executive Summary -->
  <h2>Executive Summary</h2>
  <div style="background:#f0f9ff;border-left:4px solid #0ea5e9;padding:14px 18px;border-radius:4px;font-size:14px;color:#0c4a6e;line-height:1.6;">
    ${run.executiveSummary}
  </div>

  <!-- Dimension Overview Table -->
  <h2>Dimension Overview</h2>
  <table>
    <thead>
      <tr style="background:#f8fafc;">
        <th style="padding:10px 8px;text-align:left;border-bottom:2px solid #e2e8f0;font-size:13px;">Dimension</th>
        <th style="padding:10px 8px;text-align:left;border-bottom:2px solid #e2e8f0;font-size:13px;">Status</th>
        <th style="padding:10px 8px;text-align:left;border-bottom:2px solid #e2e8f0;font-size:13px;">Summary</th>
      </tr>
    </thead>
    <tbody>
      ${dimensionRows(run.findings)}
    </tbody>
  </table>

  <!-- Detailed Findings -->
  <h2>Detailed Findings & Recommendations</h2>
  ${findingsDetail(run.findings)}

  <!-- Evidence Appendix -->
  <h2>Evidence Appendix</h2>
  ${evidenceSection(run)}

  <!-- Footer -->
  <div style="margin-top:40px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center;">
    Generated by ESG Retail Bias Scanner &nbsp;·&nbsp; ${new Date().toISOString()} &nbsp;·&nbsp;
    This report is intended for internal improvement purposes. Visual diversity scores are approximations only.
  </div>

</div>
</body>
</html>`;
}
