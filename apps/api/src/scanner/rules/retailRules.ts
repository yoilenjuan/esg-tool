/**
 * Retail Inclusivity Rules — deterministic, pure-function scoring.
 *
 * Each `classify*` function takes a typed input derived from the scanner's
 * raw analysis data and returns a `RuleResult` containing:
 *   - status        : one of the five ComplianceStatus values
 *   - statusReason  : 1-sentence human-readable explanation of the status
 *   - issues        : list of specific problems detected
 *   - actual        : negative example of what was observed (or "N/A")
 *   - goodPractice  : concrete recommended alternative with brand examples
 *   - brandExamples : real-world inclusive implementations
 *   - recommendations : actionable remediation steps
 *
 * All functions are pure (no I/O, no side effects) — safe to call in tests
 * and from worker threads.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ComplianceStatus =
  | 'Complies'
  | 'Partially Complies'
  | 'Does Not Comply'
  | 'Not Requested'
  | 'Mixed / Multi-flow';

/** Option in a detected select / radio field. */
export interface FieldOption {
  value: string;
  label: string;
}

/** Minimal field descriptor consumed by rules (no Playwright types). */
export interface RuleField {
  /** Category assigned by forms.ts classifyField() */
  category: string;
  /** Select / radio options (empty for text inputs) */
  options: FieldOption[];
  /** Human-readable label text */
  label: string;
  /** input[name] attribute */
  name: string;
  /** input[placeholder] */
  placeholder: string;
  /** Whether the field is marked required */
  required: boolean;
  /** Page URL where the field was found */
  pageUrl: string;
}

/** Unified result type returned by every classify* function. */
export interface RuleResult {
  /** Compliance status according to the rule. */
  status: ComplianceStatus;
  /** One sentence explaining why this status was assigned. */
  statusReason: string;
  /** Zero or more specific problems detected. */
  issues: string[];
  /** Negative example — what was actually observed (or "None detected." if Not Requested). */
  actual: string;
  /** Positive description of what good practice looks like, with concrete examples. */
  goodPractice: string;
  /** Real-world brand or platform examples. */
  brandExamples: string[];
  /** Actionable remediation steps. */
  recommendations: string[];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function optionText(field: RuleField): string {
  return field.options
    .map((o) => o.label.trim())
    .filter(Boolean)
    .join(', ');
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. GENDER
// ═══════════════════════════════════════════════════════════════════════════════

export interface GenderRuleInput {
  /** Fields with category === 'gender' */
  fields: RuleField[];
  /** Count of language bias issues with ruleId in gender-related rules */
  genderLanguageIssueCount: number;
  /** Specific gendered copy snippets detected */
  genderLanguageSnippets: string[];
}

/**
 * Classify gender inclusivity.
 *
 * Scoring ladder:
 *   Complies         — field has male + female + at least one non-binary / self-describe option
 *   Partially        — field exists but only binary options or gendered language patterns present
 *   Does Not Comply  — field is binary-only AND critical language issues detected (≥2)
 *   Not Requested    — no gender field, no gendered language issues
 */
export function classifyGender(input: GenderRuleInput): RuleResult {
  const { fields, genderLanguageIssueCount, genderLanguageSnippets } = input;

  if (fields.length === 0 && genderLanguageIssueCount === 0) {
    return {
      status: 'Not Requested',
      statusReason: 'No gender-related fields or gendered language patterns were detected.',
      issues: [],
      actual: 'None detected.',
      goodPractice:
        'Offer gender options: Hombre / Mujer / No binario / Prefiero auto-describirme [free text]. Make the field optional.',
      brandExamples: ['ASOS', 'Selfridges', 'Google Account settings'],
      recommendations: [
        'If gender is collected, add non-binary and self-describe options.',
        'Make gender / title optional.',
        'Replace binary salutations (Sr./Sra.) with neutral alternatives.',
      ],
    };
  }

  const allOptions = fields.flatMap((f) => f.options.map((o) => o.label.toLowerCase()));
  const hasMale   = allOptions.some((o) => /hombre|male|masculino\b|^man$/.test(o));
  const hasFemale = allOptions.some((o) => /mujer|female|femenino\b|^woman$/.test(o));
  const hasOther  = allOptions.some((o) =>
    /otro|other|non[\s-]?binary|no[\s-]?binario|prefer|prefiero|self[\s-]?describe|identify/i.test(o),
  );

  const sampleOptions = fields[0] ? optionText(fields[0]) : 'N/A';
  const snippetStr    = genderLanguageSnippets.slice(0, 3).map((s) => `"${s}"`).join(', ');

  if (hasMale && hasFemale && hasOther) {
    return {
      status: 'Complies',
      statusReason: 'Gender field includes non-binary or self-describe options alongside binary choices.',
      issues: [],
      actual: `Gender field options: [${sampleOptions}].`,
      goodPractice:
        'Offer: Hombre / Mujer / No binario / Prefiero auto-describirme. Make field optional.',
      brandExamples: ['ASOS', 'Selfridges', 'Pret a Manger', 'Google Account settings'],
      recommendations: [
        'Periodically review options as social norms evolve.',
        'Ensure self-describe text is persisted and respected in communications.',
      ],
    };
  }

  const isBinaryOnly = (hasMale || hasFemale) && !hasOther;
  const isHighSeverity = isBinaryOnly && genderLanguageIssueCount >= 2;

  const issues: string[] = [];
  if (isBinaryOnly && fields.length > 0) {
    issues.push(
      `Gender field offers binary options only: [${sampleOptions}]. Non-binary identities excluded.`,
    );
  }
  if (genderLanguageSnippets.length > 0) {
    issues.push(
      `Gendered language pattern(s) detected: ${snippetStr}.`,
    );
  }
  if (fields.length === 0 && genderLanguageIssueCount > 0) {
    issues.push(`${genderLanguageIssueCount} gendered language pattern(s) in copy (no form field found).`);
  }

  return {
    status: isHighSeverity ? 'Does Not Comply' : 'Partially Complies',
    statusReason: isHighSeverity
      ? 'Binary-only gender field combined with multiple gendered language issues constitutes a systemic exclusion pattern.'
      : 'Gender field or language patterns present but non-binary identities are not fully accommodated.',
    issues,
    actual: fields.length > 0
      ? `Gender dropdown shows: [${sampleOptions}].`
      : `No gender field, but copy contains gendered patterns: ${snippetStr || 'N/A'}.`,
    goodPractice:
      'Offer: Hombre / Mujer / No binario / Prefiero auto-describirme [free text]. See ASOS or Selfridges for reference implementations.',
    brandExamples: ['ASOS', 'Selfridges', 'Pret a Manger', 'Google Account settings'],
    recommendations: [
      'Add non-binary and self-describe options to all gender dropdowns.',
      'Replace Sr./Sra. salutations with neutral alternatives (e.g. "Estimado cliente").',
      'Make gender / title field optional.',
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. EMAIL ADDRESS INTERNATIONALISATION (EAI)
// ═══════════════════════════════════════════════════════════════════════════════

export interface EAIRuleInput {
  /** True if at least one email field was found and probed. */
  probed: boolean;
  /** True if ASCII emails were accepted. */
  asciiAccepted: boolean;
  /** True if Unicode Latin-extended emails were rejected (e.g. josé@correo.es). */
  unicodeLatinRejected: boolean;
  /** True if Indic-script Unicode emails were rejected (e.g. अजय@भारत.in). */
  unicodeIndicRejected: boolean;
}

/**
 * Classify EAI (RFC 6531) compliance.
 *
 * Scoring ladder:
 *   Not Requested    — no email field found
 *   Complies         — all probed address types accepted
 *   Partially        — ASCII & Latin-extended accepted but Indic rejected (or reverse)
 *   Does Not Comply  — ASCII rejected OR both Unicode variants rejected
 */
export function classifyEAI(input: EAIRuleInput): RuleResult {
  const { probed, asciiAccepted, unicodeLatinRejected, unicodeIndicRejected } = input;

  if (!probed) {
    return {
      status: 'Not Requested',
      statusReason: 'No email input field was found across scanned pages.',
      issues: [],
      actual: 'None detected.',
      goodPractice:
        'When collecting email, remove ASCII-only patterns. See Gmail, Outlook, Shopify — all support Unicode email addresses.',
      brandExamples: ['Gmail (since 2014)', 'Outlook.com', 'Shopify checkout'],
      recommendations: [
        'Test any future email fields with: josé@correo.es, müller@beispiel.de, अजय@भारत.in',
        'Ensure backend mail system supports SMTPUTF8 per RFC 6531.',
      ],
    };
  }

  const issues: string[] = [];
  if (!asciiAccepted) {
    issues.push('Standard ASCII email addresses are not accepted — fundamental validation failure.');
  }
  if (unicodeLatinRejected) {
    issues.push(
      'Latin-extended Unicode emails (e.g. josé@correo.es) are rejected by client-side validation.',
    );
  }
  if (unicodeIndicRejected) {
    issues.push(
      'Indic-script Unicode emails (e.g. अजय@भारत.in) are rejected — excluding South Asian diaspora customers.',
    );
  }

  if (!asciiAccepted) {
    return {
      status: 'Does Not Comply',
      statusReason: 'Email field rejects even standard ASCII addresses, making registration impossible.',
      issues,
      actual: 'Email field validation blocks standard addresses — likely broken regex.',
      goodPractice:
        'Remove restrictive client-side patterns. Validate per RFC 5322 + RFC 6531 server-side.',
      brandExamples: ['Gmail', 'Outlook.com', 'Shopify Checkout'],
      recommendations: [
        'Remove or fix client-side email regex.',
        'Validate RFC 5322 compliance server-side.',
        'Test with: test@example.com, user+tag@domain.co.uk',
      ],
    };
  }

  if (unicodeLatinRejected && unicodeIndicRejected) {
    return {
      status: 'Does Not Comply',
      statusReason:
        'Email fields reject both Latin-extended and Indic-script Unicode addresses, blocking a significant portion of international customers.',
      issues,
      actual:
        'HTML5 type="email" with strict ASCII pattern rejects any address with accented or non-Latin characters.',
      goodPractice:
        'Remove pattern restrictions; validate EAI server-side per RFC 6531. Reference: Gmail, Outlook, Shopify all accept Unicode email.',
      brandExamples: ['Gmail (since 2014)', 'Outlook.com', 'Shopify checkout'],
      recommendations: [
        'Strip client-side email pattern attribute or broaden regex to allow Unicode.',
        'Ensure SMTPUTF8 support in backend mail system (RFC 6531).',
        'Test with: josé@correo.es, müller@beispiel.de, अजय@भारत.in',
      ],
    };
  }

  if (unicodeLatinRejected || unicodeIndicRejected) {
    const rejected = [
      unicodeLatinRejected && 'Latin-extended (e.g. josé@correo.es)',
      unicodeIndicRejected && 'Indic-script (e.g. अजय@भारत.in)',
    ]
      .filter(Boolean)
      .join(' and ');

    return {
      status: 'Partially Complies',
      statusReason: `Email field accepts ASCII addresses but rejects ${rejected} Unicode addresses.`,
      issues,
      actual: `Email fields use ASCII-only validation, blocking ${rejected} addresses.`,
      goodPractice:
        'Broadening validation to RFC 6531 takes one regex change; see Gmail and Shopify implementations.',
      brandExamples: ['Gmail', 'Shopify checkout', 'Outlook.com'],
      recommendations: [
        'Update client-side validation to permit Unicode characters in local-part.',
        'Validate RFC 6531 compliance on the server.',
        `Test with: ${unicodeLatinRejected ? 'josé@correo.es' : 'अजय@भारत.in'}`,
      ],
    };
  }

  return {
    status: 'Complies',
    statusReason: 'Email fields accept both ASCII and Unicode (EAI) addresses without rejection.',
    issues: [],
    actual: 'Email field accepts Unicode addresses as intended.',
    goodPractice: 'Continue to support SMTPUTF8 and RFC 6531 in backend mail infrastructure.',
    brandExamples: ['Gmail', 'Shopify', 'Outlook.com'],
    recommendations: [
      'Periodically re-test EAI acceptance after any checkout or form refactor.',
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. NATIONALITY
// ═══════════════════════════════════════════════════════════════════════════════

export interface NationalityRuleInput {
  /** Fields with category === 'nationality' */
  fields: RuleField[];
  /** Count of nationality-bias language issues */
  nationalityLanguageIssueCount: number;
  /** Sample snippets of biased nationality-related copy */
  nationalityLanguageSnippets: string[];
}

/**
 * Classify nationality field inclusivity.
 *
 * Scoring ladder:
 *   Not Requested    — no field, no language issues
 *   Partially        — nationality field present (GDPR concern) OR minor language issues
 *   Does Not Comply  — nationality collected + language bias issues ≥ 2
 */
export function classifyNationality(input: NationalityRuleInput): RuleResult {
  const { fields, nationalityLanguageIssueCount, nationalityLanguageSnippets } = input;

  if (fields.length === 0 && nationalityLanguageIssueCount === 0) {
    return {
      status: 'Not Requested',
      statusReason: 'No nationality field or nationality-biased language was detected.',
      issues: [],
      actual: 'None detected.',
      goodPractice:
        'Do not collect nationality unless legally required. Use country-of-residence for shipping/billing.',
      brandExamples: ['Zalando (no nationality field)', 'Amazon (residence country only)'],
      recommendations: [
        'Confirm no nationality data is collected in checkout / registration.',
        'If nationality is required, document GDPR legal basis explicitly.',
      ],
    };
  }

  const issues: string[] = [];
  for (const f of fields) {
    issues.push(
      `Nationality field "${f.label || f.name}" collected on: ${f.pageUrl}. GDPR legal basis must be documented.`,
    );
  }
  for (const s of nationalityLanguageSnippets.slice(0, 3)) {
    issues.push(`Nationality-biased copy: "${s}".`);
  }

  const isHighSeverity = fields.length > 0 && nationalityLanguageIssueCount >= 2;

  return {
    status: isHighSeverity ? 'Does Not Comply' : 'Partially Complies',
    statusReason: isHighSeverity
      ? 'Nationality is collected as required data and accompanied by biased language, creating a systemic exclusion risk.'
      : 'Nationality field present; GDPR necessity not established, which may discourage or exclude non-national customers.',
    issues,
    actual:
      fields.length > 0
        ? `Nationality is a required field on ${fields.map((f) => f.pageUrl).join(', ')}.`
        : `Nationality-biased language detected: ${nationalityLanguageSnippets.slice(0, 2).map((s) => `"${s}"`).join(', ')}.`,
    goodPractice:
      'Only collect nationality when legally mandated (e.g. age verification). Document GDPR basis. See Zalando and Amazon for reference.',
    brandExamples: ['Zalando (residence only)', 'Amazon EU (residence country)'],
    recommendations: [
      'Remove nationality field unless a documented legal basis exists.',
      'Replace with country-of-residence for shipping/billing purposes.',
      'Conduct DPIA for any nationality data collection.',
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. COUNTRY OF RESIDENCE
// ═══════════════════════════════════════════════════════════════════════════════

export interface CountryRuleInput {
  /** Fields with category === 'country' */
  fields: RuleField[];
  /** If a country dropdown was found, how many options does the most restrictive one have? */
  minOptionCount: number;
}

/**
 * Classify country field inclusivity.
 *
 * Scoring ladder:
 *   Not Requested    — no country field
 *   Complies         — field present with comprehensive country list (≥ 50 options)
 *   Partially        — field present but restricted list (< 50 options or EU/Spain only)
 *   Does Not Comply  — field present but ≤ 5 options (effectively domestic only)
 */
export function classifyCountry(input: CountryRuleInput): RuleResult {
  const { fields, minOptionCount } = input;

  if (fields.length === 0) {
    return {
      status: 'Not Requested',
      statusReason: 'No country-of-residence field was detected on scanned pages.',
      issues: [],
      actual: 'None detected.',
      goodPractice:
        'Country field is standard for e-commerce. Ensure all ~200 countries are available.',
      brandExamples: ['Zara (worldwide shipping)', 'Mango', 'El Corte Inglés'],
      recommendations: [
        'Add a country field to checkout/registration forms.',
        'Ensure full ISO 3166-1 country list is available.',
      ],
    };
  }

  const selectorFields = fields.filter((f) => f.options.length > 0);
  const effectiveCount = selectorFields.length > 0 ? minOptionCount : 999; // text input = unrestricted

  if (effectiveCount <= 5) {
    return {
      status: 'Does Not Comply',
      statusReason:
        'Country dropdown contains very few options, effectively restricting checkout to domestic customers only.',
      issues: [
        `Country dropdown has only ${effectiveCount} option(s) — international customers cannot complete checkout.`,
      ],
      actual: `Country selector has ${effectiveCount} option(s): [${optionText(selectorFields[0])}].`,
      goodPractice:
        'Use a full ISO 3166-1 country list (~250 entries). See Zara or Amazon checkout for reference.',
      brandExamples: ['Zara', 'Amazon EU', 'Mango'],
      recommendations: [
        'Replace restricted country list with a full ISO 3166-1 country picker.',
        'Consider using a well-maintained open-source country list library.',
        'Test checkout with non-Spanish shipping addresses.',
      ],
    };
  }

  if (effectiveCount < 50) {
    return {
      status: 'Partially Complies',
      statusReason:
        'Country selector is present but offers a limited list that excludes many international customers.',
      issues: [
        `Country dropdown has ${effectiveCount} option(s) — some international customers may be blocked.`,
      ],
      actual: `Country selector has ${effectiveCount} option(s).`,
      goodPractice:
        'Expand to full ISO 3166-1 ~250 country list. See Zara or Mango checkout.',
      brandExamples: ['Zara', 'Mango', 'Amazon EU'],
      recommendations: [
        'Expand country list to full ISO 3166-1 coverage.',
        'Prioritise frequently used countries at the top of the dropdown.',
      ],
    };
  }

  return {
    status: 'Complies',
    statusReason:
      'Country field is present with a comprehensive list of countries available for selection.',
    issues: [],
    actual: `Country selector has ${effectiveCount} option(s) — comprehensive coverage.`,
    goodPractice:
      'Continue to maintain a full country list. Periodically validate against ISO 3166-1.',
    brandExamples: ['Zara', 'Amazon EU', 'Mango'],
    recommendations: [
      'Periodically sync country list with ISO 3166-1 updates.',
      'Test checkout with non-European shipping addresses.',
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. CIVIL / MARITAL STATUS
// ═══════════════════════════════════════════════════════════════════════════════

export interface CivilStatusRuleInput {
  /** Fields with category === 'civil_status' */
  fields: RuleField[];
  /** Count of heteronormative language issues (ESG_HETERONORMATIVE rule) */
  heteronormativeIssueCount: number;
  /** Sample snippets of heteronormative copy */
  heteronormativeSnippets: string[];
}

/**
 * Classify civil / marital status inclusivity.
 *
 * Scoring ladder:
 *   Not Requested    — no field, no heteronormative issues
 *   Complies         — field present but inclusive, or only minor language issues (≤ 1)
 *   Partially        — 1–2 heteronormative patterns in copy
 *   Does Not Comply  — ≥ 3 heteronormative patterns or required binary field
 */
export function classifyCivilStatus(input: CivilStatusRuleInput): RuleResult {
  const { fields, heteronormativeIssueCount, heteronormativeSnippets } = input;

  if (fields.length === 0 && heteronormativeIssueCount === 0) {
    return {
      status: 'Not Requested',
      statusReason: 'No marital status field or heteronormative language patterns were detected.',
      issues: [],
      actual: 'None detected.',
      goodPractice:
        'Avoid collecting civil status unless required. Use inclusive family language: "pareja", "familia".',
      brandExamples: ['Ikea Spain', 'Zara Home', 'El Corte Inglés (updated 2023)'],
      recommendations: [
        'Audit marketing copy for heteronormative assumptions.',
        'Replace "marido/esposa" with "pareja" in copy.',
      ],
    };
  }

  const snippetStr = heteronormativeSnippets.slice(0, 3).map((s) => `"${s}"`).join(', ');
  const issues: string[] = [];
  for (const s of heteronormativeSnippets.slice(0, 5)) {
    issues.push(`Heteronormative copy detected: "${s}".`);
  }
  for (const f of fields) {
    const opts = optionText(f);
    if (opts) issues.push(`Civil status field options: [${opts}].`);
  }

  if (heteronormativeIssueCount >= 3) {
    return {
      status: 'Does Not Comply',
      statusReason:
        'Multiple heteronormative language patterns found across the site, systematically excluding same-sex couples and non-traditional families.',
      issues,
      actual: `Heteronormative copy examples: ${snippetStr}.`,
      goodPractice:
        'Use "pareja" instead of "marido/esposa", "persona responsable" instead of "padre/madre". See Ikea Spain and Zara Home for inclusive family wording.',
      brandExamples: ['Ikea Spain', 'Zara Home', 'El Corte Inglés (updated 2023)'],
      recommendations: [
        'Conduct a full copy audit and replace all heteronormative terms.',
        'Update CMS templates to use inclusive defaults.',
        'Brief content team on inclusive language guidelines.',
      ],
    };
  }

  return {
    status: 'Partially Complies',
    statusReason:
      `${heteronormativeIssueCount} heteronormative language pattern(s) detected that may make non-traditional families feel excluded.`,
    issues,
    actual: `Heteronormative copy: ${snippetStr || 'present'}.`,
    goodPractice:
      'Replace binary family terms with neutral equivalents: "pareja", "familia", "persona a cargo".',
    brandExamples: ['Ikea Spain', 'Zara Home'],
    recommendations: [
      'Replace gendered / heteronormative family language.',
      'Remove civil status from registration unless legally required.',
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. AGE INCLUSIVITY
// ═══════════════════════════════════════════════════════════════════════════════

export interface AgeRuleInput {
  /** Fields with category === 'age_dob' */
  fields: RuleField[];
  /** Count of ageist language issues (ESG_AGEIST_TERM) */
  ageistIssueCount: number;
  /** Sample snippets of ageist copy */
  ageistSnippets: string[];
}

/**
 * Classify age inclusivity.
 *
 * Scoring ladder:
 *   Not Requested    — no age field, no ageist language
 *   Complies         — age field optional or no ageist language
 *   Partially        — 1 ageist language issue
 *   Does Not Comply  — ≥ 2 ageist language issues
 */
export function classifyAge(input: AgeRuleInput): RuleResult {
  const { fields, ageistIssueCount, ageistSnippets } = input;

  if (fields.length === 0 && ageistIssueCount === 0) {
    return {
      status: 'Not Requested',
      statusReason: 'No age-related fields or ageist language patterns were detected.',
      issues: [],
      actual: 'None detected.',
      goodPractice:
        'Replace "tercera edad", "ancianos" with "personas mayores" or "clientes de todas las edades".',
      brandExamples: ['El Corte Inglés age-inclusive catalogue', 'Boots UK'],
      recommendations: [
        'Audit marketing copy for ageist terms.',
        'Consider accessible font sizes and contrast for older users.',
      ],
    };
  }

  const snippetStr = ageistSnippets.slice(0, 3).map((s) => `"${s}"`).join(', ');
  const issues = ageistSnippets
    .slice(0, 5)
    .map((s) => `Ageist language: "${s}".`);

  if (ageistIssueCount >= 2) {
    return {
      status: 'Does Not Comply',
      statusReason:
        `${ageistIssueCount} ageist language patterns detected, representing a systemic pattern that alienates older customers.`,
      issues,
      actual: `Ageist copy detected: ${snippetStr}.`,
      goodPractice:
        'Replace "tercera edad", "ancianos" with "personas de todas las edades". See El Corte Inglés inclusive marketing guidelines.',
      brandExamples: ['El Corte Inglés age-inclusive catalogue', 'Boots UK', 'Saga UK'],
      recommendations: [
        'Audit and replace all ageist copy.',
        'Ensure WCAG 2.1 AA contrast and minimum 16px font sizes.',
        'Test checkout with screen readers and zoom at 200%.',
      ],
    };
  }

  return {
    status: 'Partially Complies',
    statusReason:
      'One ageist language pattern detected; unlikely to be systemic but worth addressing.',
    issues,
    actual: `Ageist copy: ${snippetStr}.`,
    goodPractice:
      'Replace ageist terms with neutral alternatives. "Personas mayores" is preferred over "ancianos" or "tercera edad".',
    brandExamples: ['El Corte Inglés (updated copy)', 'Boots UK'],
    recommendations: [
      'Replace the identified ageist term(s).',
      'Brief the content team on age-inclusive language.',
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. RACE & ETHNICITY / VISUAL DIVERSITY
// ═══════════════════════════════════════════════════════════════════════════════

export type DiversityRating = 'Diverse' | 'Moderate' | 'Limited' | 'Unknown';

export interface RaceEthnicityRuleInput {
  /** Visual diversity rating from heuristic image analysis. */
  diversityRating: DiversityRating;
  /** Number of large human-context images detected. */
  largeImagesFound: number;
  /** Observation note from visual analyser (never identifies individuals). */
  observationNote: string;
}

/**
 * Classify race & ethnicity / visual diversity.
 *
 * Scoring ladder:
 *   Not Requested    — unknown rating (no images found / inconclusive)
 *   Complies         — Diverse rating
 *   Partially        — Moderate rating
 *   Does Not Comply  — Limited rating
 */
export function classifyRaceEthnicity(input: RaceEthnicityRuleInput): RuleResult {
  const { diversityRating, largeImagesFound, observationNote } = input;

  const disclaimer =
    'Visual diversity analysis is based solely on image metadata and context. No individuals are identified.';
  const actual = `Visual diversity rating: ${diversityRating} (${largeImagesFound} large image(s) analysed). ${observationNote}`;

  if (diversityRating === 'Unknown') {
    return {
      status: 'Not Requested',
      statusReason: 'Insufficient imagery found to assess visual diversity.',
      issues: [],
      actual,
      goodPractice:
        'Use diverse talent in editorial imagery. Document alt-text describing context without identifying race. See Nike "For All" campaign.',
      brandExamples: ['Nike "For All" campaign', 'H&M Inclusive casting', 'Dove Real Beauty'],
      recommendations: [
        'Ensure editorial images include descriptive alt-text for accessibility.',
        'Commission a visual diversity review with an equity specialist.',
      ],
    };
  }

  const statusMap: Record<Exclude<DiversityRating, 'Unknown'>, ComplianceStatus> = {
    Diverse:  'Complies',
    Moderate: 'Partially Complies',
    Limited:  'Does Not Comply',
  };

  const reasonMap: Record<Exclude<DiversityRating, 'Unknown'>, string> = {
    Diverse:
      'Imagery demonstrates diverse representation across the sampled pages.',
    Moderate:
      'Some diversity present in imagery, but representation could be broader across all demographics.',
    Limited:
      'Imagery is predominantly monocultural, which may alienate customers from diverse backgrounds.',
  };

  return {
    status: statusMap[diversityRating as Exclude<DiversityRating, 'Unknown'>],
    statusReason: reasonMap[diversityRating as Exclude<DiversityRating, 'Unknown'>],
    issues: diversityRating === 'Limited'
      ? [`Visual diversity rated "${diversityRating}" across ${largeImagesFound} large image(s).`, disclaimer]
      : [disclaimer],
    actual,
    goodPractice:
      'Use diverse talent in editorial imagery. Describe image context with alt-text (do not label race). References: Nike, H&M, Dove.',
    brandExamples: ['Nike "For All" campaign', 'H&M Inclusive casting', 'Dove Real Beauty'],
    recommendations: [
      'Commission a visual audit with an external equity reviewer.',
      'Add descriptive, context-rich alt-text to all editorial images.',
      'Set diverse casting targets for future campaign production.',
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. LEGAL DOCUMENT ACCEPTANCE
// ═══════════════════════════════════════════════════════════════════════════════

/** Recognised document type categories. */
export type DocType = 'dni' | 'nie' | 'passport' | 'residence_card' | 'eu_id' | 'other_id' | 'unknown';

const DOC_TYPE_PATTERNS: Array<{ type: DocType; patterns: RegExp[] }> = [
  {
    type: 'dni',
    patterns: [
      /\bdni\b/i,
      /\bnif\b/i,
      /\bdocumento\s+nacional\s+de\s+identidad/i,
      /\bnational\s+id\b/i,
      /tarjeta\s+de\s+identidad\s+(española|nacional)/i,
    ],
  },
  {
    type: 'nie',
    patterns: [
      /\bnie\b/i,
      /número\s+de\s+identidad\s+de\s+extranjero/i,
      /\bforeign\s+(id|identification)\b/i,
      /\bni[eé]\s*[-–]?\s*(extranjero|residencia)/i,
    ],
  },
  {
    type: 'passport',
    patterns: [
      /\bpasaporte\b/i,
      /\bpassport\b/i,
    ],
  },
  {
    type: 'residence_card',
    patterns: [
      /tarjeta\s+de\s+residencia/i,
      /permiso\s+de\s+residencia/i,
      /\bresidence\s+card\b/i,
      /\bresidence\s+permit\b/i,
    ],
  },
  {
    type: 'eu_id',
    patterns: [
      /\btarjeta\s+comunitaria\b/i,
      /\beu\s+id\b/i,
      /\beu\s+citizen/i,
      /\bid\s+card\s+\(?eu\)?/i,
      /ue.*identidad/i,
    ],
  },
  {
    type: 'other_id',
    patterns: [
      /\botros?\s+documentos?\b/i,
      /\bother\s+(id|document)\b/i,
      /\bany\s+document\b/i,
      /\bseguridad\s+social\b/i,
      /\bsocial\s+security\b/i,
    ],
  },
];

/** Map a single option label to its DocType. */
export function detectDocType(label: string): DocType {
  for (const { type, patterns } of DOC_TYPE_PATTERNS) {
    for (const p of patterns) {
      if (p.test(label)) return type;
    }
  }
  return 'unknown';
}

/** Derive the full set of accepted DocTypes for an array of options. */
export function acceptedDocTypes(options: FieldOption[]): Set<DocType> {
  const types = new Set<DocType>();
  for (const opt of options) {
    const t = detectDocType(opt.label);
    if (t !== 'unknown') types.add(t);
  }
  return types;
}

export interface LegalDocRuleInput {
  /**
   * All detected fields with category === 'legal_document'.
   * Includes both select/radio fields (with options) and plain text fields.
   */
  fields: RuleField[];
  /**
   * Number of language issues matching the ESG_DOCUMENT_SPANISH_ONLY rule,
   * e.g. copy saying "introduzca su DNI" without alternatives.
   */
  docLanguageIssueCount: number;
  /** Sample snippets from matching language issues */
  docLanguageSnippets: string[];
}

/**
 * Classify legal document acceptance (identity document inclusivity).
 *
 * Detection strategy:
 *   1. No fields + no language issues → Not Requested
 *   2. Language issues explicitly mention DNI-only restriction → Does Not Comply
 *   3. Select / radio field with typed options:
 *        - Maps every option to a DocType (dni, nie, passport, residence_card, eu_id, other_id)
 *        - Multi-page check: if different pages accept different doc sets → Mixed
 *        - Scoring:
 *            Complies         — (dni|nie) AND passport AND (residence_card|eu_id|other_id)
 *            Partially        — (dni AND nie) OR (dni AND passport) but not full set
 *            Does Not Comply  — only dni|nif; no alternatives
 *   4. Plain text field only (no options):
 *        - If label/name/placeholder indicates DNI-only → Does Not Comply
 *        - Neutral text field → Partially (accepts free text but doc type unclear)
 *
 * Sales impact: ~8% of Spanish residents are foreign nationals — all blocked by DNI-only validation.
 */
export function classifyLegalDoc(input: LegalDocRuleInput): RuleResult {
  const { fields, docLanguageIssueCount, docLanguageSnippets } = input;

  // ── 1. Not Requested ───────────────────────────────────────────────────────
  if (fields.length === 0 && docLanguageIssueCount === 0) {
    return {
      status: 'Not Requested',
      statusReason: 'No identity document field or document-related copy was detected.',
      issues: [],
      actual: 'None detected.',
      goodPractice:
        'When identity verification is required, accept DNI, NIE (X/Y/Z + 7 digits + letter), EU passport, and "Otro documento" free text. See Banco Santander and BBVA digital onboarding.',
      brandExamples: [
        'Banco Santander KYC (multi-doc)',
        'BBVA digital onboarding',
        'Correos ID verification',
      ],
      recommendations: [
        'Avoid collecting identity documents unless legally required.',
        'If required, support the full range: DNI, NIE, passport, residence card.',
      ],
    };
  }

  // ── 2. Language issues indicate Spanish-only doc ───────────────────────────
  if (docLanguageIssueCount >= 1) {
    const snippetStr = docLanguageSnippets.slice(0, 3).map((s) => `"${s}"`).join(', ');
    return {
      status: 'Does Not Comply',
      statusReason:
        'Copy explicitly requests a DNI/NIF without offering alternatives, blocking all non-Spanish-national customers.',
      issues: [
        `${docLanguageIssueCount} instance(s) of Spanish-only document language detected: ${snippetStr}.`,
        'Non-nationals holding NIE, EU passport, or residence card cannot comply.',
      ],
      actual: `Page copy restricts to Spanish DNI/NIF: ${snippetStr}.`,
      goodPractice:
        'Replace "Introduce tu DNI" with "Introduce tu número de documento (DNI, NIE, pasaporte, tarjeta de residencia)".',
      brandExamples: [
        'Banco Santander KYC (multi-doc)',
        'BBVA digital onboarding',
        'Correos ID verification',
      ],
      recommendations: [
        'Update copy to name all accepted document types.',
        'Add a document type selector before the number field.',
        'Apply format validation only after document type is chosen.',
      ],
    };
  }

  // ── 3. Classify by detected fields ────────────────────────────────────────
  const selectorFields = fields.filter((f) => f.options.length > 1);
  const textFields     = fields.filter((f) => f.options.length <= 1);

  // ── 3a. Only plain-text input(s) ──────────────────────────────────────────
  if (selectorFields.length === 0 && textFields.length > 0) {
    const dniOnlyField = textFields.find((f) => {
      const hint = `${f.label} ${f.placeholder} ${f.name}`.toLowerCase();
      const hasDni = /\bdni\b|\bnif\b/.test(hint);
      const hasAlternatives = /nie|pasaporte|passport|residen/.test(hint);
      return hasDni && !hasAlternatives;
    });

    if (dniOnlyField) {
      return {
        status: 'Does Not Comply',
        statusReason:
          'Text field label or placeholder specifies DNI/NIF only, implying no alternative documents are accepted.',
        issues: [
          `Field "${dniOnlyField.label || dniOnlyField.name}" on ${dniOnlyField.pageUrl} appears to accept DNI only.`,
          'Non-nationals with NIE or passport cannot complete this step.',
        ],
        actual: `Field labelled "${dniOnlyField.label || dniOnlyField.placeholder}" — implies 8-digit DNI format only.`,
        goodPractice:
          'Add a document type selector. Apply format validation only after type is selected. Example: BBVA digital onboarding.',
        brandExamples: [
          'Banco Santander KYC (multi-doc)',
          'BBVA digital onboarding',
          'Correos ID verification',
        ],
        recommendations: [
          'Prepend a document type selector (DNI / NIE / Pasaporte / Tarjeta de residencia / Otro).',
          'Update label/placeholder to reflect all accepted document types.',
          'Apply format validation only after document type is selected.',
        ],
      };
    }

    // Neutral text field — document type not specified
    return {
      status: 'Partially Complies',
      statusReason:
        'A document number text field is present but the accepted document types are not communicated, leaving international customers uncertain.',
      issues: [
        'Document field accepts free text but does not indicate which document types are accepted.',
      ],
      actual: `Text field "${textFields[0].label || textFields[0].name}" present but accepted document types are not stated.`,
      goodPractice:
        'Explicitly label which document types are accepted. Add a document type selector.',
      brandExamples: ['Banco Santander KYC', 'BBVA digital onboarding'],
      recommendations: [
        'Add a document type selector alongside the text field.',
        'Update field label or help text to list accepted document types.',
      ],
    };
  }

  // ── 3b. Select / radio field(s) with options ──────────────────────────────

  // Build per-page accepted-type sets for Mixed detection
  const perPageTypes = new Map<string, Set<DocType>>();
  for (const field of selectorFields) {
    const existing = perPageTypes.get(field.pageUrl) ?? new Set<DocType>();
    for (const t of acceptedDocTypes(field.options)) existing.add(t);
    perPageTypes.set(field.pageUrl, existing);
  }

  // Aggregate all accepted types across all pages
  const allAccepted = new Set<DocType>();
  for (const typesOnPage of perPageTypes.values()) {
    for (const t of typesOnPage) allAccepted.add(t);
  }

  // Mixed check: if multiple pages present and their accepted sets differ materially
  if (perPageTypes.size >= 2) {
    const pageSets = [...perPageTypes.values()];
    const firstSet = pageSets[0];
    const allIdentical = pageSets.every(
      (s) =>
        s.size === firstSet.size &&
        [...s].every((t) => firstSet.has(t)),
    );
    if (!allIdentical) {
      const pageDescriptions = [...perPageTypes.entries()]
        .map(([url, types]) => `${url}: [${[...types].join(', ')}]`)
        .join('; ');
      return {
        status: 'Mixed / Multi-flow',
        statusReason:
          'Different pages within the site accept different document types, creating an inconsistent and confusing user experience.',
        issues: [
          `Document type options differ across pages: ${pageDescriptions}`,
        ],
        actual: `Inconsistent doc acceptance per page: ${pageDescriptions}.`,
        goodPractice:
          'Standardise document acceptance across all pages. Accept DNI, NIE, passport, and residence card everywhere identity is required.',
        brandExamples: ['Banco Santander KYC', 'BBVA digital onboarding'],
        recommendations: [
          'Centralise document type configuration to ensure consistency across all touchpoints.',
          'Standardise to: DNI / NIE / Pasaporte / Tarjeta de residencia / Otro.',
        ],
      };
    }
  }

  // Collect accepted types for scoring
  const hasDni          = allAccepted.has('dni');
  const hasNie          = allAccepted.has('nie');
  const hasPassport     = allAccepted.has('passport');
  const hasResidenceEu  = allAccepted.has('residence_card') || allAccepted.has('eu_id');
  const hasOther        = allAccepted.has('other_id');

  // Sample the first selector's options for human-readable display
  const sampleDocs = [...allAccepted].join(', ');
  const sampleRaw  = optionText(selectorFields[0]);

  // Determines if the detected set is comprehensive
  const hasFullSet = hasDni && hasNie && hasPassport && (hasResidenceEu || hasOther);
  const hasDniOnly = hasDni && !hasNie && !hasPassport && !hasResidenceEu;

  if (hasFullSet) {
    return {
      status: 'Complies',
      statusReason:
        'Document selector accepts DNI/NIF, NIE, passport, and at least one additional document type, covering the primary needs of all Spanish residents.',
      issues: [],
      actual: `Document selector options: [${sampleRaw}]. Detected types: ${sampleDocs}.`,
      goodPractice:
        'Continue to accept DNI, NIE, EU passport, and residence card. Periodically review in case new document types are introduced.',
      brandExamples: ['Banco Santander KYC', 'BBVA digital onboarding', 'Correos ID verification'],
      recommendations: [
        'Ensure format validation adapts to the selected document type.',
        'Periodically review accepted document list as new formats are introduced.',
      ],
    };
  }

  if (hasDniOnly) {
    return {
      status: 'Does Not Comply',
      statusReason:
        'Document selector accepts only DNI/NIF, blocking all non-Spanish nationals from completing identity-required steps.',
      issues: [
        `Document selector limited to DNI/NIF only: [${sampleRaw}].`,
        '~8% of Spanish residents are foreign nationals and cannot use this form.',
        'EU residents with NIE, passport holders, and residence card holders are all excluded.',
      ],
      actual: `Document dropdown options: [${sampleRaw}] — DNI/NIF only.`,
      goodPractice:
        'Add NIE (X/Y/Z + 7 digits + letter), EU Passport, and Tarjeta de residencia. Apply format validation per selected type. See BBVA digital onboarding.',
      brandExamples: ['Banco Santander KYC', 'BBVA digital onboarding', 'Correos ID verification'],
      recommendations: [
        'Add NIE, Pasaporte, Tarjeta de residencia, and "Otro documento" to selector.',
        'Apply format validation only after document type is selected.',
        'Test with NIE format: X1234567A, and passport: AB1234567.',
      ],
    };
  }

  // Partial: some docs accepted but not the full required set
  const missing: string[] = [];
  if (!hasNie)                        missing.push('NIE');
  if (!hasPassport)                   missing.push('Pasaporte');
  if (!hasResidenceEu && !hasOther)   missing.push('Tarjeta de residencia / Otro');

  return {
    status: 'Partially Complies',
    statusReason:
      `Document selector accepts some document types but is missing: ${missing.join(', ')}, excluding significant groups of foreign-national residents.`,
    issues: [
      `Document selector accepts: [${sampleDocs}] but is missing: ${missing.join(', ')}.`,
    ],
    actual: `Document dropdown options: [${sampleRaw}]. Missing: ${missing.join(', ')}.`,
    goodPractice:
      'Expand selector to include all common document types: DNI, NIE, Pasaporte, Tarjeta de residencia, and "Otro documento".',
    brandExamples: ['Banco Santander KYC', 'BBVA digital onboarding', 'Correos ID verification'],
    recommendations: [
      `Add missing document types to selector: ${missing.join(', ')}.`,
      'Apply format validation only after document type is selected.',
      'Test with NIE format: X1234567A, and passport format: AB1234567.',
    ],
  };
}
