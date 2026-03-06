// ─── RetailRuleEngine Tests ────────────────────────────────────────────────────
// Deterministic scoring tests – no browser / Playwright involved.
// All snapshots are hand-crafted NormalizedRetailSnapshot objects.

import { RetailRuleEngine } from '../src/retail/RetailRuleEngine';
import type { NormalizedRetailSnapshot } from '../src/retail/RetailTypes';

// ── Snapshot factory ──────────────────────────────────────────────────────────

function baseSnapshot(overrides: Partial<NormalizedRetailSnapshot> = {}): NormalizedRetailSnapshot {
  return {
    url: 'https://example-shop.eu',
    market: 'EU',
    isB2C: true,
    detectedPages: {
      hasCheckout: false,
      hasRegister: false,
      hasGuestCheckout: false,
    },
    forms: [],
    selects: [],
    radios: [],
    inputs: [],
    images: [],
    anchors: [],
    accessibility: {
      missingAltCount: 0,
      missingLabelCount: 0,
      missingLangAttribute: false,
    },
    paymentMethods: ['paypal', 'visa', 'mastercard'],
    legalDocuments: {
      hasTerms: true,
      hasPrivacy: true,
      hasCookies: true,
    },
    ...overrides,
  };
}

const engine = new RetailRuleEngine();

// ─────────────────────────────────────────────────────────────────────────────
describe('RetailRuleEngine – Gender Inclusion', () => {

  it('penalises binary-only gender selector', () => {
    const snapshot = baseSnapshot({
      selects: [
        {
          name: 'gender',
          label: 'Gender',
          required: true,
          options: [
            { value: 'male',   text: 'Male' },
            { value: 'female', text: 'Female' },
          ],
          pageUrl: 'https://example-shop.eu/register',
        },
      ],
    });

    const result = engine.evaluate(snapshot);
    const dim = result.breakdown.genderInclusion;

    expect(dim.score).toBeLessThan(100);
    expect(dim.findings.some((f) => /binary/i.test(f))).toBe(true);
  });

  it('does NOT penalise a gender selector that includes a non-binary option', () => {
    const snapshot = baseSnapshot({
      selects: [
        {
          name: 'gender',
          label: 'Gender',
          required: false,
          options: [
            { value: 'male',       text: 'Male' },
            { value: 'female',     text: 'Female' },
            { value: 'non-binary', text: 'Non-binary' },
            { value: 'prefer_not', text: 'Prefer not to say' },
          ],
          pageUrl: 'https://example-shop.eu/register',
        },
      ],
    });

    const result = engine.evaluate(snapshot);
    const dim = result.breakdown.genderInclusion;

    // No binary-only or neutral-missing penalties
    expect(dim.findings.some((f) => /binary/i.test(f))).toBe(false);
    expect(dim.findings.some((f) => /neutral/i.test(f))).toBe(false);
  });

  it('penalises mandatory date-of-birth field', () => {
    const snapshot = baseSnapshot({
      inputs: [
        {
          name: 'date_of_birth',
          label: 'Date of Birth',
          inputType: 'date',
          required: true,
          placeholder: '',
          pageUrl: 'https://example-shop.eu/register',
        },
      ],
    });

    const result = engine.evaluate(snapshot);
    const dim = result.breakdown.genderInclusion;

    expect(dim.score).toBeLessThan(100);
    expect(dim.findings.some((f) => /age|birth/i.test(f))).toBe(true);
  });

  it('penalises mandatory marital-status field', () => {
    const snapshot = baseSnapshot({
      selects: [
        {
          name: 'estado_civil',
          label: 'Estado civil',
          required: true,
          options: [
            { value: 'soltero', text: 'Soltero' },
            { value: 'casado',  text: 'Casado' },
          ],
          pageUrl: 'https://example-shop.eu/register',
        },
      ],
    });

    const result = engine.evaluate(snapshot);
    const dim = result.breakdown.genderInclusion;

    expect(dim.score).toBeLessThan(100);
    expect(dim.findings.some((f) => /marital|civil/i.test(f))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('RetailRuleEngine – Internationalisation Flexibility', () => {

  it('penalises mandatory national-ID field in B2C context', () => {
    const snapshot = baseSnapshot({
      isB2C: true,
      inputs: [
        {
          name: 'dni',
          label: 'DNI',
          inputType: 'text',
          required: true,
          placeholder: '',
          pageUrl: 'https://example-shop.eu/checkout',
        },
      ],
    });

    const result = engine.evaluate(snapshot);
    const dim = result.breakdown.internationalizationFlexibility;

    expect(dim.score).toBeLessThan(100);
    expect(dim.findings.some((f) => /national.?id|dni|nie|passport/i.test(f))).toBe(true);
  });

  it('does NOT penalise non-required national-ID field', () => {
    const snapshot = baseSnapshot({
      isB2C: true,
      inputs: [
        {
          name: 'dni',
          label: 'DNI (opcional)',
          inputType: 'text',
          required: false,     // not required → no penalty
          placeholder: '',
          pageUrl: 'https://example-shop.eu/checkout',
        },
      ],
    });

    const result = engine.evaluate(snapshot);
    const dim = result.breakdown.internationalizationFlexibility;

    expect(dim.findings.some((f) => /national.?id|mandatory.*id|b2c/i.test(f))).toBe(false);
  });

  it('does NOT penalise mandatory national-ID in B2B context', () => {
    const snapshot = baseSnapshot({
      isB2C: false,
      inputs: [
        {
          name: 'cif',
          label: 'CIF',
          inputType: 'text',
          required: true,
          placeholder: '',
          pageUrl: 'https://example-shop.eu/checkout',
        },
      ],
    });

    const result = engine.evaluate(snapshot);
    const dim = result.breakdown.internationalizationFlexibility;

    // B2B context – mandatory ID is acceptable
    expect(dim.findings.some((f) => /b2c/i.test(f))).toBe(false);
  });

  it('penalises each missing legal document', () => {
    const snapshot = baseSnapshot({
      legalDocuments: { hasTerms: false, hasPrivacy: false, hasCookies: true },
    });

    const result = engine.evaluate(snapshot);
    const dim = result.breakdown.internationalizationFlexibility;

    expect(dim.score).toBeLessThanOrEqual(80); // at least 2 × 10 lost (100 − 20 = 80)
    const termsIssue   = dim.findings.some((f) => /terms|condiciones/i.test(f));
    const privacyIssue = dim.findings.some((f) => /privacy|privacidad|gdpr/i.test(f));
    expect(termsIssue).toBe(true);
    expect(privacyIssue).toBe(true);
  });

  it('full compliance when all legal docs present and no restrictive fields', () => {
    const snapshot = baseSnapshot();
    const result = engine.evaluate(snapshot);
    const dim = result.breakdown.internationalizationFlexibility;

    expect(dim.score).toBe(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('RetailRuleEngine – Checkout Friction', () => {

  it('penalises absence of guest checkout on a checkout page', () => {
    const snapshot = baseSnapshot({
      detectedPages: { hasCheckout: true, hasRegister: false, hasGuestCheckout: false },
    });

    const result = engine.evaluate(snapshot);
    const dim = result.breakdown.checkoutFriction;

    expect(dim.score).toBeLessThan(100);
    expect(dim.findings.some((f) => /guest/i.test(f))).toBe(true);
  });

  it('does NOT penalise when guest checkout is available', () => {
    const snapshot = baseSnapshot({
      detectedPages: { hasCheckout: true, hasRegister: true, hasGuestCheckout: true },
    });

    const result = engine.evaluate(snapshot);
    const dim = result.breakdown.checkoutFriction;

    expect(dim.findings.some((f) => /guest/i.test(f))).toBe(false);
  });

  it('penalises checkout forms with 8 or more required fields', () => {
    const checkoutFields = Array.from({ length: 9 }, (_, i) => ({
      name: `field_${i}`,
      inputType: 'text',
      required: true,
      label: `Field ${i}`,
      pageUrl: 'https://example-shop.eu/checkout',
    }));

    const snapshot = baseSnapshot({
      detectedPages: { hasCheckout: true, hasRegister: false, hasGuestCheckout: true },
      forms: checkoutFields,
    });

    const result = engine.evaluate(snapshot);
    const dim = result.breakdown.checkoutFriction;

    expect(dim.score).toBeLessThan(100);
    expect(dim.findings.some((f) => /required field/i.test(f))).toBe(true);
  });

  it('does NOT penalise checkout with fewer than 8 required fields', () => {
    const checkoutFields = Array.from({ length: 6 }, (_, i) => ({
      name: `field_${i}`,
      inputType: 'text',
      required: true,
      label: `Field ${i}`,
      pageUrl: 'https://example-shop.eu/checkout',
    }));

    const snapshot = baseSnapshot({
      detectedPages: { hasCheckout: true, hasRegister: false, hasGuestCheckout: true },
      forms: checkoutFields,
    });

    const result = engine.evaluate(snapshot);
    const dim = result.breakdown.checkoutFriction;

    expect(dim.findings.some((f) => /required field/i.test(f))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('RetailRuleEngine – Payment Inclusivity', () => {

  it('penalises sites with fewer than 2 payment methods', () => {
    const snapshot = baseSnapshot({ paymentMethods: ['visa'] });
    const result = engine.evaluate(snapshot);
    const dim = result.breakdown.paymentInclusivity;

    expect(dim.score).toBeLessThan(100);
    expect(dim.findings.some((f) => /payment method/i.test(f))).toBe(true);
  });

  it('penalises absence of EU digital wallet', () => {
    const snapshot = baseSnapshot({ paymentMethods: ['visa', 'mastercard', 'amex'] });
    const result = engine.evaluate(snapshot);
    const dim = result.breakdown.paymentInclusivity;

    expect(dim.score).toBeLessThan(100);
    expect(dim.findings.some((f) => /wallet/i.test(f))).toBe(true);
  });

  it('full payment score when PayPal and 2+ methods present', () => {
    const snapshot = baseSnapshot({ paymentMethods: ['paypal', 'visa', 'mastercard'] });
    const result = engine.evaluate(snapshot);
    expect(result.breakdown.paymentInclusivity.score).toBe(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('RetailRuleEngine – Accessibility Baseline', () => {

  it('penalises more than 5 missing alt texts', () => {
    const snapshot = baseSnapshot({
      accessibility: { missingAltCount: 8, missingLabelCount: 0, missingLangAttribute: false },
    });

    const result = engine.evaluate(snapshot);
    const dim = result.breakdown.accessibilityBaseline;

    expect(dim.score).toBeLessThan(100);
    expect(dim.findings.some((f) => /alt/i.test(f))).toBe(true);
  });

  it('penalises more than 3 unlabelled form fields', () => {
    const snapshot = baseSnapshot({
      accessibility: { missingAltCount: 0, missingLabelCount: 5, missingLangAttribute: false },
    });

    const result = engine.evaluate(snapshot);
    const dim = result.breakdown.accessibilityBaseline;

    expect(dim.score).toBeLessThan(100);
    expect(dim.findings.some((f) => /label/i.test(f))).toBe(true);
  });

  it('penalises missing lang attribute on <html>', () => {
    const snapshot = baseSnapshot({
      accessibility: { missingAltCount: 0, missingLabelCount: 0, missingLangAttribute: true },
    });

    const result = engine.evaluate(snapshot);
    const dim = result.breakdown.accessibilityBaseline;

    expect(dim.score).toBeLessThan(100);
    expect(dim.findings.some((f) => /lang/i.test(f))).toBe(true);
  });

  it('returns 100 when no accessibility issues present', () => {
    const snapshot = baseSnapshot({
      accessibility: { missingAltCount: 0, missingLabelCount: 0, missingLangAttribute: false },
    });

    const result = engine.evaluate(snapshot);
    expect(result.breakdown.accessibilityBaseline.score).toBe(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('RetailRuleEngine – Data Collection Proportionality', () => {

  it('penalises checkout forms with more than 12 required fields', () => {
    const excessiveFields = Array.from({ length: 14 }, (_, i) => ({
      name: `field_${i}`,
      inputType: 'text',
      required: true,
      label: `Field ${i}`,
      pageUrl: 'https://example-shop.eu/checkout',
    }));

    const snapshot = baseSnapshot({ forms: excessiveFields });
    const result = engine.evaluate(snapshot);
    const dim = result.breakdown.dataProportionality;

    expect(dim.score).toBeLessThan(100);
    expect(dim.findings.some((f) => /required fields/i.test(f))).toBe(true);
  });

  it('does NOT penalise when checkout fields are proportionate', () => {
    const normalFields = Array.from({ length: 7 }, (_, i) => ({
      name: `field_${i}`,
      inputType: 'text',
      required: true,
      label: `Field ${i}`,
      pageUrl: 'https://example-shop.eu/checkout',
    }));

    const snapshot = baseSnapshot({ forms: normalFields });
    const result = engine.evaluate(snapshot);
    const dim = result.breakdown.dataProportionality;

    expect(dim.findings.some((f) => /required fields/i.test(f))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('RetailRuleEngine – Risk Level Thresholds', () => {

  it('rates a clean site as Low risk', () => {
    const snapshot = baseSnapshot({
      detectedPages: { hasCheckout: false, hasRegister: false, hasGuestCheckout: false },
      paymentMethods: ['paypal', 'visa', 'mastercard'],
    });

    const result = engine.evaluate(snapshot);
    expect(result.riskLevel).toBe('Low');
    expect(result.overallScore).toBeGreaterThanOrEqual(75);
  });

  it('overallScore is always between 0 and 100', () => {
    // Pathological worst case
    const worst = baseSnapshot({
      isB2C: true,
      detectedPages: { hasCheckout: true, hasRegister: true, hasGuestCheckout: false },
      selects: [
        {
          name: 'gender', label: 'Gender', required: true,
          options: [{ value: 'male', text: 'Male' }, { value: 'female', text: 'Female' }],
          pageUrl: 'https://example-shop.eu/register',
        },
        {
          name: 'civil', label: 'Estado civil', required: true,
          options: [{ value: 'casado', text: 'Casado' }],
          pageUrl: 'https://example-shop.eu/register',
        },
      ],
      inputs: [
        {
          name: 'dni', label: 'DNI', inputType: 'text', required: true,
          placeholder: '', pageUrl: 'https://example-shop.eu/checkout',
        },
        {
          name: 'date_of_birth', label: 'DOB', inputType: 'date', required: true,
          placeholder: '', pageUrl: 'https://example-shop.eu/register',
        },
      ],
      paymentMethods: [],
      legalDocuments: { hasTerms: false, hasPrivacy: false, hasCookies: false },
      accessibility: { missingAltCount: 10, missingLabelCount: 8, missingLangAttribute: true },
      forms: Array.from({ length: 15 }, (_, i) => ({
        name: `field_${i}`, inputType: 'text', required: true,
        label: '', pageUrl: 'https://example-shop.eu/checkout',
      })),
    });

    const result = engine.evaluate(worst);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
  });

  it('breakdown keys match all 8 expected dimensions', () => {
    const result = engine.evaluate(baseSnapshot());
    const keys = Object.keys(result.breakdown);

    expect(keys).toContain('checkoutFriction');
    expect(keys).toContain('paymentInclusivity');
    expect(keys).toContain('internationalizationFlexibility');
    expect(keys).toContain('genderInclusion');
    expect(keys).toContain('accessibilityBaseline');
    expect(keys).toContain('microcopyBias');
    expect(keys).toContain('visualRepresentation');
    expect(keys).toContain('dataProportionality');
    expect(keys.length).toBe(8);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('RetailRuleEngine – Determinism', () => {

  it('produces identical results on repeated calls with the same snapshot', () => {
    const snapshot = baseSnapshot({
      selects: [
        {
          name: 'gender', label: 'Gender', required: true,
          options: [{ value: 'male', text: 'Male' }, { value: 'female', text: 'Female' }],
          pageUrl: 'https://example-shop.eu/register',
        },
      ],
    });

    const r1 = engine.evaluate(snapshot);
    const r2 = engine.evaluate(snapshot);

    expect(r1.overallScore).toBe(r2.overallScore);
    expect(r1.riskLevel).toBe(r2.riskLevel);
    expect(JSON.stringify(r1.breakdown)).toBe(JSON.stringify(r2.breakdown));
  });
});
