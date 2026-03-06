// ─── Dimension IDs ────────────────────────────────────────────────────────────
export type DimensionId =
  | 'gender'
  | 'email_internationalization'
  | 'nationality'
  | 'country'
  | 'civil_status'
  | 'age'
  | 'race_ethnicity'
  | 'legal_document';

// ─── Compliance Status ────────────────────────────────────────────────────────
export type ComplianceStatus =
  | 'Complies'
  | 'Partially Complies'
  | 'Does Not Comply'
  | 'Not Requested'
  | 'Mixed / Multi-flow';

// ─── Scan Depth ───────────────────────────────────────────────────────────────
export type ScanDepth = 'light' | 'standard' | 'deep';

// ─── Evidence ─────────────────────────────────────────────────────────────────
export interface Evidence {
  id: string;
  type: 'screenshot' | 'video';
  /** Relative path within the run directory, e.g. "screenshots/gender_001.png" */
  filePath: string;
  /** Public URL of the page where the evidence was captured */
  pageUrl: string;
  description: string;
  /** ISO timestamp */
  capturedAt: string;
}

// ─── Dimension Finding ────────────────────────────────────────────────────────
export interface DimensionFinding {
  dimensionId: DimensionId;
  dimensionLabel: string;
  status: ComplianceStatus;
  /** 1-3 sentence summary of what was found */
  issueSummary: string;
  /** Specific issues detected (list) */
  issues: string[];
  /** IDs of associated evidence items */
  evidenceIds: string[];
  /** Concrete recommendations for this dimension */
  recommendations: string[];
  /** Good-practice reference examples (brand names / links) */
  goodPracticeExamples: string[];
  /** Sales-focused impact analysis */
  salesImpact: SalesImpact;
}

export interface SalesImpact {
  /** How the issue hurts revenue / conversion right now */
  currentImpact: string;
  /** Forward-looking harm if unresolved */
  futureImpact: string;
  /** Business benefit if the issue is fixed */
  benefitIfResolved: string;
}

// ─── Scan Options ─────────────────────────────────────────────────────────────
export interface ScanOptions {
  url: string;
  depth: ScanDepth;
  recordVideo: boolean;
  maxPages: number;
}

// ─── Scan Run ─────────────────────────────────────────────────────────────────
export type RunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed';

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

export interface ScanRun {
  runId: string;
  options: ScanOptions;
  status: RunStatus;
  startedAt: string;
  completedAt?: string;
  pagesScanned: string[];
  findings: DimensionFinding[];
  evidence: Evidence[];
  executiveSummary: string;
  overallScore: number; // 0–100
  reportPath?: string;
  errorMessage?: string;
  /**
   * Optional retail EU scoring produced by RetailRuleEngine.
   * Typed as a generic record here to avoid a circular dependency between
   * @esg/shared and @esg/scanner.  The concrete RetailRiskScore type is
   * exported from @esg/scanner's retail sub-module.
   */
  retailRiskScore?: Record<string, unknown>;
}

// ─── API Payloads ─────────────────────────────────────────────────────────────
export interface StartScanRequest {
  options: ScanOptions;
}

export interface StartScanResponse {
  runId: string;
  message: string;
}

export interface ProgressResponse {
  progress: ScanProgress;
}

export interface ReportResponse {
  run: ScanRun;
}

// ─── Dimension Metadata ───────────────────────────────────────────────────────
export const DIMENSION_LABELS: Record<DimensionId, string> = {
  gender: 'Gender',
  email_internationalization: 'Email Internationalization (EAI)',
  nationality: 'Nationality',
  country: 'Country',
  civil_status: 'Civil / Marital Status',
  age: 'Age',
  race_ethnicity: 'Race & Ethnicity',
  legal_document: 'Legal Document',
};

export const DIMENSION_DESCRIPTIONS: Record<DimensionId, string> = {
  gender:
    'Checks for binary-only gender fields, gendered titles (Sr./Sra.), exclusive pronouns, and non-inclusive language.',
  email_internationalization:
    'Probes whether email fields accept Unicode addresses (e.g., josé@correo.es, 用户@例子.广告).',
  nationality:
    'Detects presence of nationality fields; flags closed lists and absence of self-description options.',
  country:
    'Evaluates country selector coverage, international neutrality, and language availability.',
  civil_status:
    'Checks if civil/marital status is requested; flags heteronormative options and binary honorifics.',
  age:
    'Looks for mandatory date-of-birth fields, age gates, and stereotyped age segmentation in UX copy.',
  race_ethnicity:
    'Approximate visual diversity assessment on hero/landing pages (limited / moderate / diverse).',
  legal_document:
    'Surveys accepted document types (DNI, NIE, Passport, etc.) and detects possible exclusion risks.',
};
