// ─── Retail EU eCommerce – Normalised Snapshot & Result Types ─────────────────
// All types used by RetailRuleEngine are self-contained here so that the retail
// module can be developed, tested and versioned independently of the generic ESG
// engine.

// ── DOM primitives extracted by RetailSnapshotBuilder ─────────────────────────

export interface FormField {
  /** Lowercased name/id attribute */
  name: string;
  /** Input type (text, email, tel, number, hidden, …) */
  inputType: string;
  /** Whether the field carries the `required` attribute */
  required: boolean;
  /** Closest <label> text or aria-label value */
  label: string;
  /** URL of the page the field was found on */
  pageUrl: string;
}

export interface SelectOption {
  value: string;
  text: string;
}

export interface SelectField {
  name: string;
  label: string;
  required: boolean;
  options: SelectOption[];
  pageUrl: string;
}

export interface RadioGroup {
  name: string;
  label: string;
  options: string[];
  pageUrl: string;
}

export interface InputField {
  name: string;
  label: string;
  inputType: string;
  required: boolean;
  placeholder: string;
  pageUrl: string;
}

export interface ImageItem {
  src: string;
  alt: string;
  /** Whether the element is decorative (role=presentation or empty alt) */
  decorative: boolean;
  pageUrl: string;
}

export interface AnchorItem {
  href: string;
  text: string;
  pageUrl: string;
}

// ── Snapshot ───────────────────────────────────────────────────────────────────

export interface NormalizedRetailSnapshot {
  /** Entry URL for the scan */
  url: string;
  /** Market segment – always 'EU' for this engine */
  market: 'EU';
  /** True when the site targets consumers (B2C) */
  isB2C: boolean;

  detectedPages: {
    hasCheckout: boolean;
    hasRegister: boolean;
    hasGuestCheckout: boolean;
  };

  forms: FormField[];
  selects: SelectField[];
  radios: RadioGroup[];
  inputs: InputField[];

  images: ImageItem[];
  anchors: AnchorItem[];

  accessibility: {
    missingAltCount: number;
    missingLabelCount: number;
    missingLangAttribute: boolean;
  };

  /** Payment method identifiers extracted from page text / icons */
  paymentMethods: string[];

  legalDocuments: {
    hasTerms: boolean;
    hasPrivacy: boolean;
    hasCookies: boolean;
  };
}

// ── Engine output ──────────────────────────────────────────────────────────────

export interface RetailDimensionResult {
  /** 0 – 100; base 100 minus applied penalties */
  score: number;
  /** Human-readable explanation of each penalty applied */
  findings: string[];
}

export type RetailRiskLevel = 'Critical' | 'High' | 'Medium' | 'Low';

export interface RetailRiskScore {
  /** Weighted aggregate of all dimension scores (0 – 100) */
  overallScore: number;
  riskLevel: RetailRiskLevel;
  breakdown: Record<string, RetailDimensionResult>;
}

// ── Dimension keys (strongly typed union) ─────────────────────────────────────

export type RetailDimensionKey =
  | 'checkoutFriction'
  | 'paymentInclusivity'
  | 'internationalizationFlexibility'
  | 'genderInclusion'
  | 'accessibilityBaseline'
  | 'microcopyBias'
  | 'visualRepresentation'
  | 'dataProportionality';
