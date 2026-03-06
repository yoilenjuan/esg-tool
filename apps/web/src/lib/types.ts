/**
 * Local type definitions mirroring the API's ScanRunResult shape.
 * Kept in the web app so we don't couple to internal API modules.
 */

export type ComplianceStatus =
  | 'Complies'
  | 'Partially Complies'
  | 'Does Not Comply'
  | 'Not Requested'
  | 'Mixed / Multi-flow';

export type ScanDepth = 'light' | 'standard' | 'deep';

export type RunStatus = 'queued' | 'running' | 'completed' | 'failed';

// ─── Scan options (sent to POST /api/scan) ────────────────────────────────────
export interface ScanOptions {
  url: string;
  depth: ScanDepth;
  recordVideo: boolean;
  maxPages: number;
}

// ─── Progress (GET /api/scan/:runId/progress) ─────────────────────────────────
export interface ScanProgress {
  runId: string;
  status: RunStatus;
  currentStep: string;
  pagesDiscovered: number;
  pagesScanned: number;
  percentComplete: number;
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
}

// ─── Dimension result (from ScanRunResult.dimensions) ────────────────────────
export interface ActualVsGoodPractice {
  actualBehavior: string;
  goodPractice: string;
  brandExamples: string[];
}

export interface SalesImpactDetail {
  now: string[];
  future: string[];
  benefitIfFixed: string[];
}

export interface DimensionResult {
  dimensionId: string;
  dimensionLabel: string;
  status: ComplianceStatus;
  summary: string;
  issues: string[];
  actualVsGoodPractice: ActualVsGoodPractice;
  salesImpact: SalesImpactDetail;
  evidenceIds: string[];
  recommendations: string[];
}

// ─── Evidence record ──────────────────────────────────────────────────────────
export interface EvidenceRecord {
  id: string;
  type: 'screenshot' | 'video';
  filePath: string;
  pageUrl: string;
  description: string;
  capturedAt: string;
  dimensionTags: string[];
}

// ─── Retail risk types ────────────────────────────────────────────────────────
export type RetailRiskLevel = 'Critical' | 'High' | 'Medium' | 'Low';

export interface RetailDimensionResult {
  score: number;
  findings: string[];
}

export interface RetailRiskScore {
  overallScore: number;
  riskLevel: RetailRiskLevel;
  breakdown: Record<string, RetailDimensionResult>;
}

// ─── Full scan run result (GET /api/runs/:runId → { run }) ────────────────────
export interface ScanRunResult {
  runId: string;
  companyUrl: string;
  scannedAt: string;
  completedAt: string;
  pagesScanned: string[];
  dimensions: DimensionResult[];
  evidences: EvidenceRecord[];
  salesImpactSummary: string;
  pdfPath: string | null;
  /** Primary EU Retail risk score (present when retail engine ran) */
  primaryScore?: RetailRiskScore;
  /** Weighted sub-score covering checkout, payment, i18n (0–100) */
  conversionExposureScore?: number;
  /** Risk level derived from conversionExposureScore */
  conversionExposureLevel?: RetailRiskLevel;
}
