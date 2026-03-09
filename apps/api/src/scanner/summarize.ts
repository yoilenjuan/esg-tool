/**
 * Summarise raw scanner findings into structured DimensionResult objects.
 *
 * Status, issues, actual/goodPractice, and recommendations are delegated to the
 * pure classify* functions in ./rules/retailRules — a single source of truth
 * that is independently unit-tested.
 *
 * This file is responsible only for:
 *   - Mapping raw scanner data → typed rule inputs
 *   - Providing static dimension metadata (label, salesImpact, evidenceIds)
 *   - Constructing the final DimensionResult
 */
import type {
  FormAnalysis,
  EAIAnalysis,
  LanguageBiasAnalysis,
  VisualDiversityAnalysis,
  DimensionResult,
  SalesImpactDetail,
  EvidenceRecord,
  DetectedField,
} from '../types/run';

import {
  classifyGender,
  classifyEAI,
  classifyNationality,
  classifyCountry,
  classifyCivilStatus,
  classifyAge,
  classifyRaceEthnicity,
  classifyLegalDoc,
} from './rules/retailRules';
import type { RuleField, RuleResult } from './rules/retailRules';

// ─── Mapper: DetectedField → RuleField ───────────────────────────────────────

function toRuleField(f: DetectedField): RuleField {
  return {
    category: f.category,
    options: f.options,
    label: f.label,
    name: f.name,
    placeholder: f.placeholder,
    required: f.required,
    pageUrl: f.pageUrl,
  };
}

/** Convenience: filter FormAnalysis fields by category and convert. */
function ruleFields(form: FormAnalysis, category: string): RuleField[] {
  return form.fields.filter((f) => f.category === category).map(toRuleField);
}

/** Map a RuleResult to the actualVsGoodPractice shape expected by DimensionResult. */
function avGP(rule: RuleResult) {
  return {
    actualBehavior: rule.actual,
    goodPractice: rule.goodPractice,
    brandExamples: rule.brandExamples,
  };
}

// ─── Per-dimension builders ───────────────────────────────────────────────────

function buildGenderDimension(form: FormAnalysis, langBias: LanguageBiasAnalysis, evidences: EvidenceRecord[]): DimensionResult {
  const genderIssues = langBias.issues.filter((i) =>
    [
      'ESG_GENDER_TITLE_SR',
      'ESG_GENDER_BINARY_SELECT',
      'ESG_GENDER_BINARY_COPY',
      'ESG_GENDERED_COPY_EN',
      'ESG_TITLE_FIELD_EN',
    ].includes(i.ruleId),
  );
  const rule = classifyGender({
    fields: ruleFields(form, 'gender'),
    genderLanguageIssueCount: genderIssues.length,
    genderLanguageSnippets: genderIssues.map((i) => i.match),
  });

  return {
    dimensionId: 'gender',
    dimensionLabel: 'Gender & Pronouns',
    status: rule.status,
    summary: rule.statusReason,
    issues: rule.issues,
    actualVsGoodPractice: avGP(rule),
    salesImpact: {
      now: ['Non-binary customers drop off at registration.', 'Negative brand sentiment in LGBTQ+ communities.'],
      future: ['EU Gender Recognition legislation will tighten requirements.'],
      benefitIfFixed: ['Broader addressable market (+~5-7% Millennial/Gen-Z shoppers actively choose inclusive brands).'],
    },
    evidenceIds: evidences.filter((e) => e.dimensionTags.includes('gender')).map((e) => e.id),
    recommendations: rule.recommendations,
  };
}

function buildEAIDimension(analysis: EAIAnalysis, evidences: EvidenceRecord[]): DimensionResult {
  const rule = classifyEAI({
    probed: analysis.probedPages.length > 0,
    asciiAccepted: analysis.asciiAccepted,
    unicodeLatinRejected: analysis.unicodeLatinRejected,
    unicodeIndicRejected: analysis.unicodeIndicRejected,
  });

  return {
    dimensionId: 'email_internationalization',
    dimensionLabel: 'Email Address Internationalisation (EAI)',
    status: rule.status,
    summary: rule.statusReason,
    issues: rule.issues,
    actualVsGoodPractice: avGP(rule),
    salesImpact: {
      now: [
        'Cart abandonment by Spanish-speaking customers with accented email addresses.',
        'Lost registrations from South Asian diaspora markets.',
      ],
      future: [
        'SMTPUTF8 adoption grows — non-compliant sites will face increasing support costs.',
        'Regulatory risk under EU Accessibility Act 2025.',
      ],
      benefitIfFixed: [
        'Estimated 3-5% reduction in checkout abandonment for international customers.',
        'Improved NPS from non-ASCII email users.',
      ],
    },
    evidenceIds: evidences.filter((e) => e.dimensionTags.includes('email_internationalization')).map((e) => e.id),
    recommendations: rule.recommendations,
  };
}

function buildNationalityDimension(form: FormAnalysis, langBias: LanguageBiasAnalysis, evidences: EvidenceRecord[]): DimensionResult {
  const natIssues = langBias.issues.filter((i) =>
    ['ESG_NATIONALITY_BIAS', 'ESG_NATIONALITY_SELECT_LABEL'].includes(i.ruleId),
  );
  const rule = classifyNationality({
    fields: ruleFields(form, 'nationality'),
    nationalityLanguageIssueCount: natIssues.length,
    nationalityLanguageSnippets: natIssues.map((i) => i.match),
  });

  return {
    dimensionId: 'nationality',
    dimensionLabel: 'Nationality',
    status: rule.status,
    summary: rule.statusReason,
    issues: rule.issues,
    actualVsGoodPractice: avGP(rule),
    salesImpact: {
      now: ['Customers from certain nationalities may self-exclude due to mistrust.'],
      future: ['Data Protection Authority scrutiny of nationality collection increasing.'],
      benefitIfFixed: ['Reduced privacy risk. Broader customer trust.'],
    },
    evidenceIds: evidences.filter((e) => e.dimensionTags.includes('nationality')).map((e) => e.id),
    recommendations: rule.recommendations,
  };
}

function buildCountryDimension(form: FormAnalysis, evidences: EvidenceRecord[]): DimensionResult {
  const countryFields = ruleFields(form, 'country');
  const selectorOptions = countryFields.filter((f) => f.options.length > 0);
  const minOptionCount = selectorOptions.length > 0
    ? Math.min(...selectorOptions.map((f) => f.options.length))
    : countryFields.length > 0 ? 999 : 0; // text input = 999 (unrestricted), no field = 0

  const rule = classifyCountry({ fields: countryFields, minOptionCount });

  return {
    dimensionId: 'country',
    dimensionLabel: 'Country of Residence',
    status: rule.status,
    summary: rule.statusReason,
    issues: rule.issues,
    actualVsGoodPractice: avGP(rule),
    salesImpact: {
      now: ['Restricting country list blocks cross-border sales.'],
      future: ['EU single market requirements mandate no unjustified geo-blocking.'],
      benefitIfFixed: ['Opens addressable market to international buyers.'],
    },
    evidenceIds: evidences.filter((e) => e.dimensionTags.includes('country')).map((e) => e.id),
    recommendations: rule.recommendations,
  };
}

function buildCivilStatusDimension(form: FormAnalysis, langBias: LanguageBiasAnalysis, evidences: EvidenceRecord[]): DimensionResult {
  const heteroIssues = langBias.issues.filter((i) => i.ruleId === 'ESG_HETERONORMATIVE');
  const rule = classifyCivilStatus({
    fields: ruleFields(form, 'civil_status'),
    heteronormativeIssueCount: heteroIssues.length,
    heteronormativeSnippets: heteroIssues.map((i) => i.match),
  });

  return {
    dimensionId: 'civil_status',
    dimensionLabel: 'Civil / Marital Status',
    status: rule.status,
    summary: rule.statusReason,
    issues: rule.issues,
    actualVsGoodPractice: avGP(rule),
    salesImpact: {
      now: ['Same-sex couples feel excluded in family/household product categories.'],
      future: ['Increasing social emphasis on family diversity in Spanish market.'],
      benefitIfFixed: ['Improved brand trust across diverse family structures.'],
    },
    evidenceIds: evidences.filter((e) => e.dimensionTags.includes('civil_status')).map((e) => e.id),
    recommendations: rule.recommendations,
  };
}

function buildAgeDimension(form: FormAnalysis, langBias: LanguageBiasAnalysis, evidences: EvidenceRecord[]): DimensionResult {
  const ageistIssues = langBias.issues.filter((i) => i.ruleId === 'ESG_AGEIST_TERM');
  const rule = classifyAge({
    fields: ruleFields(form, 'age_dob'),
    ageistIssueCount: ageistIssues.length,
    ageistSnippets: ageistIssues.map((i) => i.match),
  });

  return {
    dimensionId: 'age',
    dimensionLabel: 'Age Inclusivity',
    status: rule.status,
    summary: rule.statusReason,
    issues: rule.issues,
    actualVsGoodPractice: avGP(rule),
    salesImpact: {
      now: ['Older customers (50+) may feel excluded or patronised.'],
      future: ['Over-55 digital shoppers are fastest growing demographic in Spain.'],
      benefitIfFixed: ['Significant spend uplift from silver economy customers.'],
    },
    evidenceIds: evidences.filter((e) => e.dimensionTags.includes('age')).map((e) => e.id),
    recommendations: rule.recommendations,
  };
}

function buildRaceDimension(visual: VisualDiversityAnalysis, evidences: EvidenceRecord[]): DimensionResult {
  const rule = classifyRaceEthnicity({
    diversityRating: visual.rating,
    largeImagesFound: visual.largeImagesFound,
    observationNote: visual.observationNote,
  });

  return {
    dimensionId: 'race_ethnicity',
    dimensionLabel: 'Race & Ethnicity Representation',
    status: rule.status,
    summary: rule.statusReason,
    issues: rule.issues,
    actualVsGoodPractice: avGP(rule),
    salesImpact: {
      now: ['Monoculture imagery alienates 15%+ of Spanish population with non-European heritage.'],
      future: ['Spain demographic diversification accelerating — inclusive imagery becomes a commercial advantage.'],
      benefitIfFixed: ['Brand association with diversity improves NPS among younger, urban consumers.'],
    },
    evidenceIds: evidences.filter((e) => e.dimensionTags.includes('race_ethnicity')).map((e) => e.id),
    recommendations: rule.recommendations,
  };
}

function buildLegalDocDimension(form: FormAnalysis, langBias: LanguageBiasAnalysis, evidences: EvidenceRecord[]): DimensionResult {
  const docIssues = langBias.issues.filter((i) => i.ruleId === 'ESG_DOCUMENT_SPANISH_ONLY');
  const rule = classifyLegalDoc({
    fields: ruleFields(form, 'legal_document'),
    docLanguageIssueCount: docIssues.length,
    docLanguageSnippets: docIssues.map((i) => i.match),
  });

  return {
    dimensionId: 'legal_document',
    dimensionLabel: 'Identity Document Acceptance',
    status: rule.status,
    summary: rule.statusReason,
    issues: rule.issues,
    actualVsGoodPractice: avGP(rule),
    salesImpact: {
      now: ['8% of Spanish residents are foreign nationals — all blocked from completing identity verification.'],
      future: ['Spain immigration continues to rise — addressable market grows.'],
      benefitIfFixed: ['Immediate removal of barrier for NIE/passport holders.'],
    },
    evidenceIds: evidences.filter((e) => e.dimensionTags.includes('legal_document')).map((e) => e.id),
    recommendations: rule.recommendations,
  };
}

// ─── Main summariser ──────────────────────────────────────────────────────────
export interface DimensionRaw {
  formAnalysis: FormAnalysis;
  eaiAnalysis: EAIAnalysis;
  languageBias: LanguageBiasAnalysis;
  visualDiversity: VisualDiversityAnalysis;
}

export function summariseDimensions(
  raw: DimensionRaw,
  evidences: EvidenceRecord[],
): DimensionResult[] {
  const { formAnalysis, eaiAnalysis, languageBias, visualDiversity } = raw;

  return [
    buildGenderDimension(formAnalysis, languageBias, evidences),
    buildEAIDimension(eaiAnalysis, evidences),
    buildNationalityDimension(formAnalysis, languageBias, evidences),
    buildCountryDimension(formAnalysis, evidences),
    buildCivilStatusDimension(formAnalysis, languageBias, evidences),
    buildAgeDimension(formAnalysis, languageBias, evidences),
    buildRaceDimension(visualDiversity, evidences),
    buildLegalDocDimension(formAnalysis, languageBias, evidences),
  ];
}

export function buildSalesImpactSummary(dimensions: DimensionResult[]): string {
  const failing = dimensions.filter(
    (d) => d.status === 'Does Not Comply' || d.status === 'Partially Complies',
  );
  if (failing.length === 0) return 'No significant compliance gaps identified. Site demonstrates good inclusive design practices.';
  const labels = failing.map((d) => d.dimensionLabel).join(', ');
  return `${failing.length} dimension(s) with compliance gaps: ${labels}. Addressing these issues could reduce abandonment rates, improve NPS, and expand the addressable customer base.`;
}
