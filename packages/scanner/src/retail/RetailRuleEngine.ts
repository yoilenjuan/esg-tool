// ─── Retail EU eCommerce – Rule Engine ────────────────────────────────────────
// Deterministic, AI-free scoring engine for Live EU Retail websites.
// Each dimension begins at a score of 100 and penalties are subtracted.
// The final score is a weighted sum clamped to [0, 100].

import type {
  NormalizedRetailSnapshot,
  RetailDimensionResult,
  RetailRiskLevel,
  RetailRiskScore,
} from './RetailTypes';
import { RetailDimensionWeights } from './RetailDimensionWeights';
import {
  clamp,
  hasEuWallet,
  includesAny,
  includesNeutralOption,
  includesPreferNotToSay,
  isAgeField,
  isBinaryOnly,
  isCountryField,
  isEmailField,
  isGenderField,
  isMaritalStatusField,
  isNationalIdField,
  normalize,
} from './RetailHelpers';

// ── Penalty constants (separate from magic numbers in logic) ──────────────────

const PENALTY = {
  // Gender inclusion
  BINARY_GENDER_ONLY:       30,
  NO_NEUTRAL_GENDER:        20,
  NO_PREFER_NOT_TO_SAY:     10,
  MANDATORY_AGE:            15,
  MANDATORY_MARITAL:        20,

  // Internationalisation
  MANDATORY_ID_B2C:         25,
  RESTRICTIVE_EMAIL:        15,
  FIXED_COUNTRY:            10,
  MISSING_LEGAL_DOC:        10, // per missing document

  // Checkout friction
  NO_GUEST_CHECKOUT:        25,
  EXCESSIVE_REQUIRED_FIELDS: 20, // ≥ 8 required fields in checkout

  // Payment inclusivity
  LESS_THAN_TWO_METHODS:    30,
  NO_EU_WALLET:             20,

  // Accessibility
  MANY_MISSING_ALT:         20, // > 5
  MANY_MISSING_LABELS:      20, // > 3
  MISSING_LANG_ATTR:        10,

  // Microcopy bias
  GENDERED_COPY:            15,
  AGEIST_COPY:              15,
  EXCLUSIONARY_COPY:        10,

  // Visual representation
  NO_DIVERSITY_SIGNALS:     25,
  LOW_ALT_TEXT_DIVERSITY:   15,

  // Data proportionality
  EXCESSIVE_CHECKOUT_DATA:  20,
} as const;

// Tokens used for microcopy detection
const GENDERED_COPY_TOKENS = [
  'señor', 'señora', 'sr.', 'sra.', 'mr.', 'mrs.', 'don ', 'doña',
  'hombre', 'mujer', 'gentlemen', 'ladies',
];

const AGEIST_COPY_TOKENS = [
  'joven', 'jóvenes', 'millennials', 'gen z', 'baby boomer',
  'edad', 'mayor', 'tercera edad', 'senior citizen',
];

const EXCLUSIONARY_COPY_TOKENS = [
  'only for', 'sólo para', 'exclusivo para', 'available in',
  'disponible en', 'not available in your country',
];

const DIVERSITY_ALT_TOKENS = [
  'diverse', 'diversity', 'inclusiv', 'multicultural', 'team',
  'people', 'persona', 'personas', 'equipo',
];

// ── Main Engine Class ─────────────────────────────────────────────────────────

export class RetailRuleEngine {
  /**
   * Evaluate a snapshot and return a fully weighted RetailRiskScore.
   * This method is pure: same input always yields the same output.
   */
  evaluate(snapshot: NormalizedRetailSnapshot): RetailRiskScore {
    const breakdown = {
      checkoutFriction:              this.evaluateCheckout(snapshot),
      paymentInclusivity:            this.evaluatePayment(snapshot),
      internationalizationFlexibility: this.evaluateInternationalization(snapshot),
      genderInclusion:               this.evaluateGender(snapshot),
      accessibilityBaseline:         this.evaluateAccessibility(snapshot),
      microcopyBias:                 this.evaluateMicrocopy(snapshot),
      visualRepresentation:          this.evaluateVisual(snapshot),
      dataProportionality:           this.evaluateDataCollection(snapshot),
    };

    return this.computeFinalScore(breakdown);
  }

  // ── Dimension: Gender Inclusion ─────────────────────────────────────────────

  private evaluateGender(snapshot: NormalizedRetailSnapshot): RetailDimensionResult {
    let score = 100;
    const findings: string[] = [];

    // Collect all gender/title selects
    const genderSelects = snapshot.selects.filter((s) =>
      isGenderField(s.name) || isGenderField(s.label)
    );

    const genderRadios = snapshot.radios.filter((r) =>
      isGenderField(r.name) || isGenderField(r.label)
    );

    if (genderSelects.length > 0 || genderRadios.length > 0) {
      // Aggregate all option values from every gender field
      const allOptions: string[] = [
        ...genderSelects.flatMap((s) => s.options.map((o) => o.value || o.text)),
        ...genderRadios.flatMap((r) => r.options),
      ];

      if (isBinaryOnly(allOptions)) {
        score -= PENALTY.BINARY_GENDER_ONLY;
        findings.push(
          `Binary-only gender options detected (${allOptions.filter(Boolean).map(normalize).join(', ')}). ` +
          `Missing non-binary and neutral options.`
        );
      } else if (!includesNeutralOption(allOptions)) {
        score -= PENALTY.NO_NEUTRAL_GENDER;
        findings.push('Gender selector present but no neutral/non-binary option found.');
      }

      if (!includesPreferNotToSay(allOptions)) {
        score -= PENALTY.NO_PREFER_NOT_TO_SAY;
        findings.push('"Prefer not to say" option missing from gender field.');
      }
    }

    // Mandatory age (DOB) field
    const requiredAgeFields = snapshot.inputs.filter(
      (i) => i.required && (isAgeField(i.name) || isAgeField(i.label))
    );
    if (requiredAgeFields.length > 0) {
      score -= PENALTY.MANDATORY_AGE;
      findings.push(
        `Mandatory date-of-birth / age field detected on: ` +
        `${[...new Set(requiredAgeFields.map((f) => f.pageUrl))].join(', ')}.`
      );
    }

    // Mandatory marital status field
    const requiredMaritalFields = [
      ...snapshot.inputs.filter(
        (i) => i.required && (isMaritalStatusField(i.name) || isMaritalStatusField(i.label))
      ),
      ...snapshot.selects.filter(
        (s) => s.required && (isMaritalStatusField(s.name) || isMaritalStatusField(s.label))
      ),
    ];
    if (requiredMaritalFields.length > 0) {
      score -= PENALTY.MANDATORY_MARITAL;
      findings.push(
        `Mandatory marital/civil-status field detected on: ` +
        `${[...new Set(requiredMaritalFields.map((f) => f.pageUrl))].join(', ')}.`
      );
    }

    if (findings.length === 0) {
      findings.push('No binary-only gender issues detected.');
    }

    return { score: clamp(score), findings };
  }

  // ── Dimension: Internationalisation Flexibility ─────────────────────────────

  private evaluateInternationalization(snapshot: NormalizedRetailSnapshot): RetailDimensionResult {
    let score = 100;
    const findings: string[] = [];

    // Mandatory national-ID field in B2C context
    if (snapshot.isB2C) {
      const requiredIdFields = [
        ...snapshot.inputs.filter(
          (i) => i.required && (isNationalIdField(i.name) || isNationalIdField(i.label))
        ),
        ...snapshot.selects.filter(
          (s) => s.required && (isNationalIdField(s.name) || isNationalIdField(s.label))
        ),
      ];
      if (requiredIdFields.length > 0) {
        score -= PENALTY.MANDATORY_ID_B2C;
        findings.push(
          `Mandatory national-ID field(s) detected in a B2C checkout flow ` +
          `(${requiredIdFields.map((f) => f.name).join(', ')}). ` +
          `This excludes non-national residents and EU/EEA visitors.`
        );
      }
    }

    // Restrictive email validation (input type restricted to ASCII-only pattern)
    const emailInputs = snapshot.inputs.filter(
      (i) => isEmailField(i.name) || isEmailField(i.label) || i.inputType === 'email'
    );
    const restrictiveEmail = emailInputs.some((i) =>
      includesAny(i.placeholder, ['example@', '@gmail', '@hotmail'])
    );
    if (restrictiveEmail) {
      score -= PENALTY.RESTRICTIVE_EMAIL;
      findings.push(
        'Email field placeholder suggests ASCII-only email validation. Unicode email addresses (EAI / RFC 6532) may be rejected.'
      );
    }

    // Fixed / limited country selection
    const countrySelects = snapshot.selects.filter(
      (s) => isCountryField(s.name) || isCountryField(s.label)
    );
    const hasFixedCountry = countrySelects.some(
      (s) => s.options.length > 0 && s.options.length < 10
    );
    if (hasFixedCountry) {
      score -= PENALTY.FIXED_COUNTRY;
      findings.push(
        'Country selector contains fewer than 10 options, indicating a geo-restricted form that may exclude international customers.'
      );
    }

    // Missing legal documents
    const { hasTerms, hasPrivacy, hasCookies } = snapshot.legalDocuments;
    if (!hasTerms) {
      score -= PENALTY.MISSING_LEGAL_DOC;
      findings.push('Terms & Conditions link not detected. Required under EU consumer law (DSA / UCPD).');
    }
    if (!hasPrivacy) {
      score -= PENALTY.MISSING_LEGAL_DOC;
      findings.push('Privacy Policy link not detected. Required under GDPR Article 13.');
    }
    if (!hasCookies) {
      score -= PENALTY.MISSING_LEGAL_DOC;
      findings.push('Cookie Policy / consent mechanism not detected. Required under ePrivacy Directive.');
    }

    if (findings.length === 0) {
      findings.push('No internationalisation restrictions detected.');
    }

    return { score: clamp(score), findings };
  }

  // ── Dimension: Checkout Friction ────────────────────────────────────────────

  private evaluateCheckout(snapshot: NormalizedRetailSnapshot): RetailDimensionResult {
    let score = 100;
    const findings: string[] = [];

    // No guest checkout
    if (snapshot.detectedPages.hasCheckout && !snapshot.detectedPages.hasGuestCheckout) {
      score -= PENALTY.NO_GUEST_CHECKOUT;
      findings.push(
        'Checkout flow detected but no guest-checkout option found. ' +
        'Forced account creation increases cart abandonment by up to 35% (Baymard Institute).'
      );
    }

    // Excessive required fields in checkout
    const checkoutRequiredFields = snapshot.forms.filter(
      (f) =>
        f.required &&
        includesAny(f.pageUrl, ['checkout', 'pago', 'payment', 'order', 'pedido'])
    );
    if (checkoutRequiredFields.length >= 8) {
      score -= PENALTY.EXCESSIVE_REQUIRED_FIELDS;
      findings.push(
        `${checkoutRequiredFields.length} required fields detected in checkout flow. ` +
        `Forms with ≥ 8 required fields significantly increase drop-off rates.`
      );
    }

    if (findings.length === 0) {
      findings.push('No checkout friction issues detected.');
    }

    return { score: clamp(score), findings };
  }

  // ── Dimension: Payment Inclusivity ──────────────────────────────────────────

  private evaluatePayment(snapshot: NormalizedRetailSnapshot): RetailDimensionResult {
    let score = 100;
    const findings: string[] = [];

    const methods = snapshot.paymentMethods;

    if (methods.length < 2) {
      score -= PENALTY.LESS_THAN_TWO_METHODS;
      findings.push(
        `Only ${methods.length} payment method(s) detected. ` +
        `Offering fewer than 2 options excludes a significant share of EU shoppers.`
      );
    }

    if (!hasEuWallet(methods)) {
      score -= PENALTY.NO_EU_WALLET;
      findings.push(
        'No major EU digital wallet detected (PayPal, Klarna, Apple Pay, Google Pay, Bizum, iDEAL, Sofort). ' +
        'Wallets account for 35%+ of EU online transactions.'
      );
    }

    if (findings.length === 0) {
      findings.push('Payment methods appear inclusive and diverse.');
    }

    return { score: clamp(score), findings };
  }

  // ── Dimension: Accessibility Baseline (WCAG 2.1 AA proxy) ──────────────────

  private evaluateAccessibility(snapshot: NormalizedRetailSnapshot): RetailDimensionResult {
    let score = 100;
    const findings: string[] = [];
    const { missingAltCount, missingLabelCount, missingLangAttribute } = snapshot.accessibility;

    if (missingAltCount > 5) {
      score -= PENALTY.MANY_MISSING_ALT;
      findings.push(
        `${missingAltCount} image(s) missing alt text (WCAG 1.1.1). ` +
        `Screen-reader users cannot interpret these images.`
      );
    }

    if (missingLabelCount > 3) {
      score -= PENALTY.MANY_MISSING_LABELS;
      findings.push(
        `${missingLabelCount} form field(s) missing associated <label> or aria-label (WCAG 1.3.1). ` +
        `Assistive technology cannot announce field purpose.`
      );
    }

    if (missingLangAttribute) {
      score -= PENALTY.MISSING_LANG_ATTR;
      findings.push(
        'HTML <html> element is missing the lang attribute (WCAG 3.1.1). ' +
        'Screen readers may use the wrong language for pronunciation.'
      );
    }

    if (findings.length === 0) {
      findings.push('No critical accessibility baseline issues detected.');
    }

    return { score: clamp(score), findings };
  }

  // ── Dimension: Microcopy Bias ────────────────────────────────────────────────

  private evaluateMicrocopy(snapshot: NormalizedRetailSnapshot): RetailDimensionResult {
    let score = 100;
    const findings: string[] = [];

    // Collect all visible anchor text to scan for biased copy
    const allText = snapshot.anchors.map((a) => a.text).join(' ').toLowerCase();

    if (this.includesAnyTokens(allText, GENDERED_COPY_TOKENS)) {
      score -= PENALTY.GENDERED_COPY;
      findings.push('Gendered language detected in navigation/anchor copy (e.g., señor/señora, Mr./Mrs.).');
    }

    if (this.includesAnyTokens(allText, AGEIST_COPY_TOKENS)) {
      score -= PENALTY.AGEIST_COPY;
      findings.push('Age-segmented language detected in microcopy. Targeting by generation can alienate other age groups.');
    }

    if (this.includesAnyTokens(allText, EXCLUSIONARY_COPY_TOKENS)) {
      score -= PENALTY.EXCLUSIONARY_COPY;
      findings.push('Exclusionary phrasing detected ("only for", "not available in your country"). May violate EU geo-blocking rules.');
    }

    if (findings.length === 0) {
      findings.push('No significant microcopy bias detected in visible anchor text.');
    }

    return { score: clamp(score), findings };
  }

  // ── Dimension: Visual Representation ─────────────────────────────────────────

  private evaluateVisual(snapshot: NormalizedRetailSnapshot): RetailDimensionResult {
    let score = 100;
    const findings: string[] = [];

    const meaningfulImages = snapshot.images.filter((img) => !img.decorative);

    if (meaningfulImages.length === 0) {
      score -= PENALTY.NO_DIVERSITY_SIGNALS;
      findings.push(
        'No non-decorative images found. Cannot assess visual diversity. ' +
        'Ensure hero and product images represent diverse demographics.'
      );
      return { score: clamp(score), findings };
    }

    // Approximate diversity from alt texts
    const altsWithDiversitySignals = meaningfulImages.filter((img) =>
      includesAny(img.alt, DIVERSITY_ALT_TOKENS)
    );

    const diversityRatio = altsWithDiversitySignals.length / meaningfulImages.length;

    if (diversityRatio < 0.1) {
      score -= PENALTY.LOW_ALT_TEXT_DIVERSITY;
      findings.push(
        `Only ${altsWithDiversitySignals.length}/${meaningfulImages.length} images have alt text suggesting diverse representation. ` +
        'Consider updating image alt text to reflect inclusive visual choices.'
      );
    }

    if (findings.length === 0) {
      findings.push('Visual representation appears adequately described in alt text.');
    }

    return { score: clamp(score), findings };
  }

  // ── Dimension: Data Collection Proportionality ───────────────────────────────

  private evaluateDataCollection(snapshot: NormalizedRetailSnapshot): RetailDimensionResult {
    let score = 100;
    const findings: string[] = [];

    // Count all required fields across any checkout/order page
    const checkoutForms = snapshot.forms.filter((f) =>
      includesAny(f.pageUrl, ['checkout', 'pago', 'payment', 'order', 'pedido', 'cart', 'carrito'])
    );
    const requiredCheckoutFields = checkoutForms.filter((f) => f.required);

    // GDPR data-minimisation: if a checkout collects more than 12 required data
    // points, it is likely collecting disproportionate personal data.
    if (requiredCheckoutFields.length > 12) {
      score -= PENALTY.EXCESSIVE_CHECKOUT_DATA;
      findings.push(
        `${requiredCheckoutFields.length} required fields detected in checkout flow. ` +
        'GDPR Article 5(1)(c) requires data minimisation. Consider making non-essential fields optional.'
      );
    }

    // Presence of sensitive fields that are mandatory (sin justification)
    const sensitiveMandatory = snapshot.inputs.filter(
      (i) =>
        i.required &&
        (isNationalIdField(i.name) ||
          isNationalIdField(i.label) ||
          isAgeField(i.name) ||
          isAgeField(i.label))
    );
    if (sensitiveMandatory.length > 0) {
      score -= 10;
      findings.push(
        `${sensitiveMandatory.length} sensitive field(s) (national ID / age) collected as mandatory. ` +
        'Verify legal basis under GDPR Article 6 before collection.'
      );
    }

    if (findings.length === 0) {
      findings.push('Data collection appears proportionate to purchase flow requirements.');
    }

    return { score: clamp(score), findings };
  }

  // ── Final Score Computation ──────────────────────────────────────────────────

  private computeFinalScore(
    results: Record<string, RetailDimensionResult>
  ): RetailRiskScore {
    let weightedSum = 0;

    for (const [key, result] of Object.entries(results)) {
      const weight = RetailDimensionWeights[key as keyof typeof RetailDimensionWeights] ?? 0;
      weightedSum += clamp(result.score) * weight;
    }

    const overallScore = Math.round(clamp(weightedSum));
    const riskLevel = this.deriveRiskLevel(overallScore);

    return {
      overallScore,
      riskLevel,
      breakdown: results,
    };
  }

  private deriveRiskLevel(score: number): RetailRiskLevel {
    if (score < 40) return 'Critical';
    if (score < 60) return 'High';
    if (score < 75) return 'Medium';
    return 'Low';
  }

  // ── Private utility ──────────────────────────────────────────────────────────

  private includesAnyTokens(text: string, tokens: string[]): boolean {
    return tokens.some((t) => text.includes(normalize(t)));
  }
}
