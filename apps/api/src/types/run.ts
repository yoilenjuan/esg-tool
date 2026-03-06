/**
 * Rich internal types for the API-native scanning engine.
 * These extend / complement the @esg/shared types with more scanner detail.
 */

// ─── Re-export shared types used throughout ───────────────────────────────────
export type {
  DimensionId,
  ComplianceStatus,
  ScanDepth,
  ScanOptions,
  Evidence,
  DimensionFinding,
  SalesImpact,
} from '@esg/shared';

// ─── Logger ──────────────────────────────────────────────────────────────────
export interface RunLogger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string, err?: unknown) => void;
}

// ─── Progress callback ────────────────────────────────────────────────────────
export interface ProgressUpdate {
  runId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  currentStep: string;
  pagesDiscovered: number;
  pagesScanned: number;
  percentComplete: number;
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
}
export type ProgressCallback = (update: ProgressUpdate) => void;

// ─── Crawled page ────────────────────────────────────────────────────────────
export type PageCategory =
  | 'home'
  | 'register'
  | 'login'
  | 'checkout'
  | 'cart'
  | 'account'
  | 'newsletter'
  | 'contact'
  | 'careers'
  | 'marketing'
  | 'product'
  | 'other';

export interface CrawledPage {
  url: string;
  title: string;
  /** Raw HTML content */
  html: string;
  /** Extracted visible text (stripped of tags) */
  visibleText: string;
  category: PageCategory;
  /** True when at least one <form> or significant input cluster was found */
  hasForm: boolean;
  /** HTTP status code returned */
  httpStatus: number;
  /** ms taken to load */
  loadTimeMs: number;
  crawledAt: string;
}

// ─── Form fields ──────────────────────────────────────────────────────────────
export type FormFieldCategory =
  | 'email'
  | 'gender'
  | 'nationality'
  | 'country'
  | 'civil_status'
  | 'age_dob'
  | 'legal_document'
  | 'other';

export interface FieldOption {
  value: string;
  label: string;
}

export interface DetectedField {
  category: FormFieldCategory;
  tagName: string;           // input | select | textarea
  inputType: string;         // text | email | date | select | radio | checkbox
  name: string;
  id: string;
  label: string;             // associated <label> text
  ariaLabel: string;
  placeholder: string;
  required: boolean;
  options: FieldOption[];    // for select / radio
  pageUrl: string;
  /** CSS selector to locate this element */
  selector: string;
}

export interface FormAnalysis {
  pagesWithForms: string[];
  fields: DetectedField[];
}

// ─── EAI probe ────────────────────────────────────────────────────────────────
export type EAIProbeState = 'accepted' | 'rejected' | 'unknown';

export interface EAIProbeAttempt {
  emailAddress: string;
  emailKind: 'ascii' | 'unicode_latin' | 'unicode_indic';
  state: EAIProbeState;
  /** Browser-reported validation message if any */
  validationMessage: string;
  /** Visible error text extracted from the DOM */
  visibleError: string;
  /** True when HTML5 validity check shows invalid */
  html5Invalid: boolean;
  /** Class-name patterns suggesting a red/error border */
  errorClassDetected: boolean;
  /** Evidence screenshot ID if rejection screenshot was taken */
  evidenceId: string | null;
  pageUrl: string;
}

export interface EAIAnalysis {
  probes: EAIProbeAttempt[];
  unicodeLatinRejected: boolean;
  unicodeIndicRejected: boolean;
  asciiAccepted: boolean;
  probedPages: string[];
}

// ─── Language bias ────────────────────────────────────────────────────────────
export interface LanguageIssue {
  ruleId: string;
  description: string;
  /** Exact text snippet that matched */
  match: string;
  /** Surrounding context (~80 chars) */
  context: string;
  suggestion: string;
  pageUrl: string;
  /** Whether triggered by LanguageTool (vs custom rule) */
  source: 'languagetool' | 'custom';
}

export interface LanguageBiasAnalysis {
  issues: LanguageIssue[];
  languageToolAvailable: boolean;
  pagesAnalysed: string[];
}

// ─── Visual diversity ─────────────────────────────────────────────────────────
export type DiversityRating = 'Limited' | 'Moderate' | 'Diverse' | 'Unknown';

export interface VisualDiversityAnalysis {
  rating: DiversityRating;
  /** Number of large human-context images detected */
  largeImagesFound: number;
  /** Cautious narrative about what was observed — never identifies individuals */
  observationNote: string;
  /** Always appended disclaimer */
  disclaimer: string;
  pagesAnalysed: string[];
}

// ─── Per-dimension result ─────────────────────────────────────────────────────
export interface ActualVsGoodPractice {
  /** What was actually found (negative example / gap) */
  actualBehavior: string;
  /** Recommended replacement with concrete example */
  goodPractice: string;
  /** Real-world brand/platform examples */
  brandExamples: string[];
}

export interface SalesImpactDetail {
  now: string[];           // 2-3 bullets
  future: string[];        // 2-3 bullets
  benefitIfFixed: string[]; // 2-3 bullets
}

export interface DimensionResult {
  dimensionId: string;
  dimensionLabel: string;
  status: string;          // ComplianceStatus
  summary: string;
  issues: string[];
  actualVsGoodPractice: ActualVsGoodPractice;
  salesImpact: SalesImpactDetail;
  evidenceIds: string[];
  recommendations: string[];
}

// ─── Retail EU scoring sub-types (mirrors RetailRiskScore from @esg/scanner) ──
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

// ─── Final scan run result ────────────────────────────────────────────────────
export interface ScanRunResult {
  runId: string;
  status: 'completed' | 'failed';
  companyUrl: string;
  scannedAt: string;
  completedAt: string;
  pagesScanned: string[];
  dimensions: DimensionResult[];
  evidences: EvidenceRecord[];
  salesImpactSummary: string;
  pdfPath: string | null;

  /**
   * PRIMARY score — produced by the RetailRuleEngine.
   * This replaces overallScore as the main KPI shown in UI & PDF.
   */
  primaryScore?: RetailRiskScore;

  /**
   * Conversion-critical sub-score (0–100) derived from the weighted average of
   * checkoutFriction, paymentInclusivity, and genderInclusion dimensions only.
   */
  conversionExposureScore?: number;

  /**
   * Risk level for the conversion-critical subset.
   */
  conversionExposureLevel?: RetailRiskLevel;

  /** Raw analysis data (kept for debugging / re-processing) */
  _raw?: {
    formAnalysis: FormAnalysis;
    eaiAnalysis: EAIAnalysis;
    languageBias: LanguageBiasAnalysis;
    visualDiversity: VisualDiversityAnalysis;
  };
}

// ─── Evidence record (internal, richer than shared Evidence) ─────────────────
export interface EvidenceRecord {
  id: string;
  type: 'screenshot' | 'video';
  /** Relative path inside run dir */
  filePath: string;
  pageUrl: string;
  description: string;
  capturedAt: string;
  /** Tag(s) linking this evidence to dimension(s) */
  dimensionTags: string[];
}

// ─── Scanner config ───────────────────────────────────────────────────────────
export interface ScannerRunConfig {
  runId: string;
  baseUrl: string;
  origin: string;
  maxPages: number;
  depth: string;
  recordVideo: boolean;
  runDir: string;
  screenshotsDir: string;
  videosDir: string;
  navigationTimeoutMs: number;
  pageLoadDelayMs: number;
  userAgent: string;
}
