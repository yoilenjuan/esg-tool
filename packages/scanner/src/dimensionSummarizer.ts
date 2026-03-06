import {
  DimensionFinding,
  DimensionId,
  DIMENSION_LABELS,
  ComplianceStatus,
  SalesImpact,
} from '@esg/shared';
import { FormFieldAnalysis } from './analyzers/gender';
import { EAIProbeResult } from './analyzers/email';
import { NationalityAnalysis } from './analyzers/nationality';
import { CountryAnalysis } from './analyzers/country';
import { CivilStatusAnalysis } from './analyzers/civilStatus';
import { AgeAnalysis } from './analyzers/age';
import { RaceEthnicityAnalysis } from './analyzers/raceEthnicity';
import { LegalDocumentAnalysis } from './analyzers/legalDocument';
import { Evidence } from '@esg/shared';

// ─── Sales impacts database ────────────────────────────────────────────────────
const SALES_IMPACTS: Record<DimensionId, SalesImpact> = {
  gender: {
    currentImpact:
      'Binary gender fields alienate non-binary and transgender customers, causing form abandonment at registration/checkout. Studies show 1–4% of population identifies outside binary gender.',
    futureImpact:
      'Gen Z (>25% of purchasing power by 2030) expects inclusive UX as baseline. Brands perceived as exclusionary lose share to competitors.',
    benefitIfResolved:
      'Inclusive gender fields increase registration completion rates by ~3–7%, reduce support contacts, and boost NPS among LGBTQ+ segments.',
  },
  email_internationalization: {
    currentImpact:
      'Rejecting Unicode emails (RFC 6532) blocks customers with non-ASCII names — a large segment in LATAM, Asia and among diaspora communities. Direct revenue loss per rejected registration.',
    futureImpact:
      'As global ecommerce grows, EAI adoption will become a compliance expectation. Delayed migration increases technical debt.',
    benefitIfResolved:
      'Accepting EAI emails removes a silent conversion blocker, estimates suggest 0.5–2% registration uplift in international markets.',
  },
  nationality: {
    currentImpact:
      'Closed nationality lists with no self-description option exclude customers who do not identify with listed nationalities, increasing dropout and complaints.',
    futureImpact:
      'Cross-border commerce regulation (e.g., EU Digital Markets Act) may require inclusive identity fields.',
    benefitIfResolved:
      'Open or self-description nationality fields reduce friction for international customers and improve data quality.',
  },
  country: {
    currentImpact:
      'Country selectors missing key emerging markets exclude potential customers before the purchase is even attempted.',
    futureImpact:
      'APAC and Africa represent the fastest-growing ecommerce markets. Limited country coverage directly caps addressable market.',
    benefitIfResolved:
      'Comprehensive country coverage enables cross-border sales, reduces customer support overhead, and signals global ambition.',
  },
  civil_status: {
    currentImpact:
      'Requiring civil status without inclusive options (e.g., domestic partner, civil union) excludes same-sex couples and non-traditional family structures.',
    futureImpact:
      'Legal frameworks in numerous markets now recognise diverse family structures; non-compliance creates regulatory exposure.',
    benefitIfResolved:
      'Inclusive civil status options improve completeness of customer data and signal brand inclusivity, a key purchasing factor for LGBTQ+ consumers.',
  },
  age: {
    currentImpact:
      'Mandatory date-of-birth fields deter privacy-conscious customers. Age-stereotyped copy alienates both younger and older segments.',
    futureImpact:
      'GDPR and CCPA impose data minimisation; collecting unnecessary DOB data increases compliance risk.',
    benefitIfResolved:
      'Removing unnecessary DOB requirements reduces registration friction. Age-neutral UX copy broadens appeal across all demographics.',
  },
  race_ethnicity: {
    currentImpact:
      'Limited visual representation on hero pages signals exclusion to minority ethnic customers, correlating with lower engagement and bounce-rate increases for those segments.',
    futureImpact:
      'Diverse representation in brand imagery is increasingly a purchasing criterion, especially for Gen Z and millennial consumers.',
    benefitIfResolved:
      'Diverse imagery improves brand perception, reduces bounce rates, and expands emotional resonance across customer segments.',
  },
  legal_document: {
    currentImpact:
      'Accepting only national ID (DNI) excludes foreign residents, tourists, and recent immigrants — real purchasing power often in premium segments.',
    futureImpact:
      'Regulatory pressure to accept multiple ID types (e.g., EU eIDAS 2.0) is increasing. Early compliance reduces future migration cost.',
    benefitIfResolved:
      'Multi-document acceptance removes a hard blocker for foreign residents and cross-border customers, directly unlocking revenue.',
  },
};

// ─── Recommendations database ──────────────────────────────────────────────────
const RECOMMENDATIONS: Record<DimensionId, string[]> = {
  gender: [
    'Add a "Prefer not to say" and/or "Non-binary / Other" option to all gender selects.',
    'Replace Mr./Mrs./Ms. with an optional Mx. honorific.',
    'Use gender-neutral copy ("your order", "the account holder") throughout.',
    'Allow users to skip gender fields entirely if not business-critical.',
  ],
  email_internationalization: [
    'Validate email addresses against RFC 5322 extended with RFC 6532 (Unicode local-part support).',
    'Remove browser-based type="email" HTML5 validation in favour of server-side EAI-aware validation.',
    'Test with: josé@correo.es, 用户@例子.广告, Ñoño@empresa.com.mx.',
  ],
  nationality: [
    'Replace closed nationality selects with a searchable free-text field with auto-complete.',
    'If a closed list is required, add "Other / Prefer to self-describe" with a text input.',
    'Evaluate whether nationality data is legally required; if not, remove the field.',
  ],
  country: [
    'Use a comprehensive ISO 3166-1 alpha-2 country list (195+ countries).',
    'Implement a searchable/auto-complete country selector.',
    'Do not pre-select or hard-code a single country.',
    'Provide localised country names where possible.',
  ],
  civil_status: [
    'Add: "Civil union / domestic partnership", "Cohabiting", "Prefer not to say" options.',
    'Evaluate whether civil status is legally required; if not, remove the field.',
    'Use gender-neutral labels: "Partner" instead of "Husband/Wife".',
  ],
  age: [
    'Only collect date of birth where legally required (e.g., age-restricted products).',
    'Replace DOB input with a simple age-confirmation checkbox for age-gating.',
    'Audit UX copy for age-segmented language; replace with inclusive alternatives.',
    'Apply data minimisation principle per GDPR Art. 5(1)(c).',
  ],
  race_ethnicity: [
    'Audit hero and landing page imagery; ensure representation across diverse contexts and skin tones.',
    'Include imagery from varied cultural contexts, not just symbolic/tokenistic representation.',
    'Consult with diverse focus groups when selecting campaign imagery.',
  ],
  legal_document: [
    'Accept at minimum: national ID (DNI), foreign resident ID (NIE), Passport, and EU Driving Licence.',
    'For international flows, accept: Passport, national ID from any country, residence permit.',
    'Validate document numbers without country-specific hard-coding.',
  ],
};

const GOOD_PRACTICES: Record<DimensionId, string[]> = {
  gender: ['Sephora (gender-neutral forms)', 'ASOS (inclusive sizing + gender options)', 'Patagonia (non-binary honorifics)'],
  email_internationalization: ['Stripe (EAI-compliant email validation)', 'Shopify (Unicode email support)'],
  nationality: ['Airbnb (free-text nationality with autocomplete)', 'Booking.com (optional nationality field)'],
  country: ['Amazon (195+ country selector with search)', 'Shopify (ISO 3166-1 complete list)'],
  civil_status: ['Progressive Insurance (inclusive civil status options)', 'Nationwide (domestic partner inclusion)'],
  age: ['Netflix (DOB only for age-restricted content)', 'Spotify (minimal DOB usage, age-gate alternative)'],
  race_ethnicity: ['Nike (diverse visual representation)', 'Fenty Beauty (inclusive imagery across all pages)'],
  legal_document: ['Revolut (multi-document onboarding)', 'N26 (passport + national ID + foreign resident ID)'],
};

// ─── Summarizer ────────────────────────────────────────────────────────────────
export function buildGenderFinding(
  analysis: FormFieldAnalysis,
  allEvidence: Evidence[]
): DimensionFinding {
  const issues: string[] = [];
  if (analysis.binaryGenderOnly) issues.push('Binary-only gender selector detected (Male/Female only).');
  if (!analysis.hasNeutralOption && analysis.genderOptions.length > 0)
    issues.push('No inclusive/neutral gender option ("Non-binary", "Other", "Prefer not to say") found.');
  if (analysis.genderedTitlesFound.length > 0)
    issues.push(`Gendered titles found: ${analysis.genderedTitlesFound.slice(0, 3).join(', ')}.`);
  if (analysis.genderOptions.length === 0)
    issues.push('No gender-related field detected in scanned forms.');

  let status: ComplianceStatus;
  if (analysis.genderOptions.length === 0) status = 'Not Requested';
  else if (analysis.binaryGenderOnly && !analysis.hasNeutralOption) status = 'Does Not Comply';
  else if (analysis.hasNeutralOption && analysis.genderedTitlesFound.length === 0) status = 'Complies';
  else status = 'Partially Complies';

  const evidenceIds = allEvidence
    .filter((e) => analysis.affectedUrls.includes(e.pageUrl))
    .map((e) => e.id)
    .slice(0, 5);

  return {
    dimensionId: 'gender',
    dimensionLabel: DIMENSION_LABELS['gender'],
    status,
    issueSummary:
      issues.length > 0
        ? issues[0]
        : 'Gender fields appear inclusive or are not present.',
    issues,
    evidenceIds,
    recommendations: RECOMMENDATIONS['gender'],
    goodPracticeExamples: GOOD_PRACTICES['gender'],
    salesImpact: SALES_IMPACTS['gender'],
  };
}

export function buildEAIFinding(
  analysis: EAIProbeResult,
  allEvidence: Evidence[]
): DimensionFinding {
  const issues: string[] = [];
  if (!analysis.unicodeAccepted && analysis.pagesWithEmailField.length > 0)
    issues.push(`Unicode email (${analysis.pagesWithEmailField.length > 0 ? 'e.g., josé@correo.es' : ''}) was rejected by the form validator.`);
  if (analysis.unicodeRejectionMessages.length > 0)
    issues.push(`Rejection message observed: "${analysis.unicodeRejectionMessages[0]}"`);
  if (analysis.pagesWithEmailField.length === 0)
    issues.push('No email fields detected on scanned pages.');

  let status: ComplianceStatus;
  if (analysis.pagesWithEmailField.length === 0) status = 'Not Requested';
  else if (!analysis.unicodeAccepted) status = 'Does Not Comply';
  else status = 'Complies';

  const evidenceIds = allEvidence
    .filter((e) => analysis.probedUrls.includes(e.pageUrl))
    .map((e) => e.id)
    .slice(0, 5);

  return {
    dimensionId: 'email_internationalization',
    dimensionLabel: DIMENSION_LABELS['email_internationalization'],
    status,
    issueSummary: issues.length > 0 ? issues[0] : 'Email fields appear to accept Unicode addresses.',
    issues,
    evidenceIds,
    recommendations: RECOMMENDATIONS['email_internationalization'],
    goodPracticeExamples: GOOD_PRACTICES['email_internationalization'],
    salesImpact: SALES_IMPACTS['email_internationalization'],
  };
}

export function buildNationalityFinding(
  analysis: NationalityAnalysis,
  allEvidence: Evidence[]
): DimensionFinding {
  const issues: string[] = [];
  if (analysis.fieldPresent && analysis.usesClosedList && !analysis.hasSelfDescription)
    issues.push('Closed nationality list with no self-description option.');
  if (analysis.fieldPresent && !analysis.usesClosedList && !analysis.hasSelfDescription)
    issues.push('Nationality field present but no free-description fallback.');
  if (!analysis.fieldPresent)
    issues.push('No nationality field detected.');

  let status: ComplianceStatus;
  if (!analysis.fieldPresent) status = 'Not Requested';
  else if (analysis.usesClosedList && !analysis.hasSelfDescription) status = 'Partially Complies';
  else if (!analysis.usesClosedList || analysis.hasSelfDescription) status = 'Complies';
  else status = 'Partially Complies';

  const evidenceIds = allEvidence
    .filter((e) => analysis.affectedUrls.includes(e.pageUrl))
    .map((e) => e.id)
    .slice(0, 5);

  return {
    dimensionId: 'nationality',
    dimensionLabel: DIMENSION_LABELS['nationality'],
    status,
    issueSummary: issues.length > 0 ? issues[0] : 'Nationality field not requested in scanned flows.',
    issues,
    evidenceIds,
    recommendations: RECOMMENDATIONS['nationality'],
    goodPracticeExamples: GOOD_PRACTICES['nationality'],
    salesImpact: SALES_IMPACTS['nationality'],
  };
}

export function buildCountryFinding(
  analysis: CountryAnalysis,
  allEvidence: Evidence[]
): DimensionFinding {
  const issues: string[] = [];
  if (!analysis.fieldPresent) issues.push('No country selector detected.');
  if (analysis.fieldPresent && analysis.coverageRating === 'limited')
    issues.push(`Country selector has limited coverage (${analysis.optionCount} options). Many countries likely missing.`);
  if (analysis.defaultsToOneCountry)
    issues.push(`Selector defaults to or only shows one country: "${analysis.detectedDefaultCountry}".`);

  let status: ComplianceStatus;
  if (!analysis.fieldPresent) status = 'Not Requested';
  else if (analysis.coverageRating === 'comprehensive' && !analysis.defaultsToOneCountry) status = 'Complies';
  else if (analysis.coverageRating === 'limited' || analysis.defaultsToOneCountry) status = 'Does Not Comply';
  else status = 'Partially Complies';

  const evidenceIds = allEvidence
    .filter((e) => analysis.affectedUrls.includes(e.pageUrl))
    .map((e) => e.id)
    .slice(0, 5);

  return {
    dimensionId: 'country',
    dimensionLabel: DIMENSION_LABELS['country'],
    status,
    issueSummary: issues.length > 0 ? issues[0] : 'Country selector appears comprehensive.',
    issues,
    evidenceIds,
    recommendations: RECOMMENDATIONS['country'],
    goodPracticeExamples: GOOD_PRACTICES['country'],
    salesImpact: SALES_IMPACTS['country'],
  };
}

export function buildCivilStatusFinding(
  analysis: CivilStatusAnalysis,
  allEvidence: Evidence[]
): DimensionFinding {
  const issues: string[] = [];
  if (!analysis.fieldPresent) issues.push('No civil/marital status field detected.');
  if (analysis.fieldPresent && !analysis.includesNonHeteronormative)
    issues.push('Civil status options do not include non-heteronormative choices (domestic partnership, civil union).');
  if (analysis.fieldPresent && analysis.binaryHonorificsOnly)
    issues.push('Only heteronormative marital statuses offered (single/married/divorced).');

  let status: ComplianceStatus;
  if (!analysis.fieldPresent) status = 'Not Requested';
  else if (analysis.includesNonHeteronormative) status = 'Complies';
  else status = 'Does Not Comply';

  const evidenceIds = allEvidence
    .filter((e) => analysis.affectedUrls.includes(e.pageUrl))
    .map((e) => e.id)
    .slice(0, 5);

  return {
    dimensionId: 'civil_status',
    dimensionLabel: DIMENSION_LABELS['civil_status'],
    status,
    issueSummary: issues.length > 0 ? issues[0] : 'Civil status not requested.',
    issues,
    evidenceIds,
    recommendations: RECOMMENDATIONS['civil_status'],
    goodPracticeExamples: GOOD_PRACTICES['civil_status'],
    salesImpact: SALES_IMPACTS['civil_status'],
  };
}

export function buildAgeFinding(
  analysis: AgeAnalysis,
  allEvidence: Evidence[]
): DimensionFinding {
  const issues: string[] = [];
  if (analysis.dobRequired) issues.push('Date of birth is marked as required in one or more forms.');
  if (analysis.ageGateDetected) issues.push('Age gate detected — restricts access without age verification alternative.');
  if (analysis.stereotypedSegmentation)
    issues.push(`Age-stereotyped language found: ${analysis.stereotypedPhrases.slice(0, 2).join('; ')}`);

  let status: ComplianceStatus;
  const concerns = (analysis.dobRequired ? 1 : 0) + (analysis.ageGateDetected ? 1 : 0) + (analysis.stereotypedSegmentation ? 1 : 0);
  if (concerns === 0) status = 'Complies';
  else if (concerns === 1) status = 'Partially Complies';
  else status = 'Does Not Comply';

  const evidenceIds = allEvidence
    .filter((e) => analysis.affectedUrls.includes(e.pageUrl))
    .map((e) => e.id)
    .slice(0, 5);

  return {
    dimensionId: 'age',
    dimensionLabel: DIMENSION_LABELS['age'],
    status,
    issueSummary: issues.length > 0 ? issues[0] : 'No age-related issues detected.',
    issues,
    evidenceIds,
    recommendations: RECOMMENDATIONS['age'],
    goodPracticeExamples: GOOD_PRACTICES['age'],
    salesImpact: SALES_IMPACTS['age'],
  };
}

export function buildRaceEthnicityFinding(
  analysis: RaceEthnicityAnalysis,
  allEvidence: Evidence[]
): DimensionFinding {
  const issues: string[] = [];
  if (analysis.diversityRating === 'limited')
    issues.push('Visual representation on key pages appears limited in diversity (approximate heuristic).');
  else if (analysis.diversityRating === 'moderate')
    issues.push('Visual diversity appears moderate; room for improvement on hero/landing pages (approximate heuristic).');

  let status: ComplianceStatus;
  if (analysis.diversityRating === 'diverse') status = 'Complies';
  else if (analysis.diversityRating === 'moderate') status = 'Partially Complies';
  else status = 'Does Not Comply';

  const evidenceIds = allEvidence
    .filter((e) => analysis.affectedUrls.includes(e.pageUrl))
    .map((e) => e.id)
    .slice(0, 5);

  return {
    dimensionId: 'race_ethnicity',
    dimensionLabel: DIMENSION_LABELS['race_ethnicity'],
    status,
    issueSummary:
      issues.length > 0
        ? `${issues[0]} ${analysis.analysisNote}`
        : `Visual diversity rated as "${analysis.diversityRating}". ${analysis.analysisNote}`,
    issues,
    evidenceIds,
    recommendations: RECOMMENDATIONS['race_ethnicity'],
    goodPracticeExamples: GOOD_PRACTICES['race_ethnicity'],
    salesImpact: SALES_IMPACTS['race_ethnicity'],
  };
}

export function buildLegalDocFinding(
  analysis: LegalDocumentAnalysis,
  allEvidence: Evidence[]
): DimensionFinding {
  const issues: string[] = [];
  if (!analysis.fieldPresent) issues.push('No legal document field detected in scanned flows.');
  if (analysis.fieldPresent && analysis.nationalOnlyRisk)
    issues.push('Only national ID (DNI) accepted — foreign residents and international customers excluded.');
  if (analysis.fieldPresent && !analysis.passportAccepted)
    issues.push('Passport not listed as an accepted document type.');
  if (analysis.fieldPresent && !analysis.foreignResidentAccepted)
    issues.push('No foreign resident document (NIE or equivalent) accepted.');

  let status: ComplianceStatus;
  if (!analysis.fieldPresent) status = 'Not Requested';
  else if (!analysis.nationalOnlyRisk && analysis.passportAccepted && analysis.foreignResidentAccepted) status = 'Complies';
  else if (analysis.nationalOnlyRisk) status = 'Does Not Comply';
  else status = 'Partially Complies';

  const evidenceIds = allEvidence
    .filter((e) => analysis.affectedUrls.includes(e.pageUrl))
    .map((e) => e.id)
    .slice(0, 5);

  return {
    dimensionId: 'legal_document',
    dimensionLabel: DIMENSION_LABELS['legal_document'],
    status,
    issueSummary: issues.length > 0 ? issues[0] : 'Legal document field not requested.',
    issues,
    evidenceIds,
    recommendations: RECOMMENDATIONS['legal_document'],
    goodPracticeExamples: GOOD_PRACTICES['legal_document'],
    salesImpact: SALES_IMPACTS['legal_document'],
  };
}
