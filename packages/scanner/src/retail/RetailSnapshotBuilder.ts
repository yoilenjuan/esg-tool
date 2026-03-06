// ─── Retail Snapshot Builder ──────────────────────────────────────────────────
// Converts the generic PageResult[] produced by the crawler into the typed
// NormalizedRetailSnapshot consumed by RetailRuleEngine.
//
// This layer is intentionally separate from the engine so that:
//   1. The engine stays pure / testable with hand-crafted snapshots.
//   2. The builder can evolve as the crawler improves.

import * as cheerio from 'cheerio';
import type { PageResult } from '../crawler';
import type {
  AnchorItem,
  FormField,
  ImageItem,
  InputField,
  NormalizedRetailSnapshot,
  RadioGroup,
  SelectField,
  SelectOption,
} from './RetailTypes';
import { includesAny, isNationalIdField, normalize } from './RetailHelpers';

// ── Payment-method tokens to scan for in page HTML ───────────────────────────
const PAYMENT_TOKENS: string[] = [
  'paypal', 'klarna', 'stripe', 'apple pay', 'google pay',
  'visa', 'mastercard', 'amex', 'american express',
  'bizum', 'ideal', 'sofort', 'sepa', 'redsys',
  'pago contra reembolso', 'cash on delivery',
  'transferencia', 'bank transfer',
];

// ── Legal-doc URL patterns ───────────────────────────────────────────────────
const TERMS_RE        = /terms|condiciones|aviso.?legal|legal.?notice|agb/i;
const PRIVACY_RE      = /privacy|privacidad|datenschutz|política.?de.?datos/i;
const COOKIES_RE      = /cookies?|cookie.?policy|política.?de.?cookies/i;

// ── Guest-checkout signals ───────────────────────────────────────────────────
const GUEST_RE =
  /guest|invitado|sin.?registro|without.?account|continue.?as.?guest|comprar.?sin/i;

// ─────────────────────────────────────────────────────────────────────────────

export function buildRetailSnapshot(
  entryUrl: string,
  pages: PageResult[]
): NormalizedRetailSnapshot {
  const forms: FormField[]    = [];
  const selects: SelectField[] = [];
  const radios: RadioGroup[]  = [];
  const inputs: InputField[]  = [];
  const images: ImageItem[]   = [];
  const anchors: AnchorItem[] = [];

  let missingAltCount     = 0;
  let missingLabelCount   = 0;
  let missingLangAttr     = false;

  const paymentSet   = new Set<string>();
  let hasTerms       = false;
  let hasPrivacy     = false;
  let hasCookies     = false;
  let hasCheckout    = false;
  let hasRegister    = false;
  let hasGuestCheckout = false;

  for (const page of pages) {
    const $ = cheerio.load(page.html);
    const pageUrl = page.url;

    // lang attribute (only needs to be missing on ONE page to flag it)
    if (!missingLangAttr && !$('html').attr('lang')) {
      missingLangAttr = true;
    }

    // Page type detection
    if (page.pageType === 'checkout') hasCheckout = true;
    if (page.pageType === 'register') hasRegister = true;

    // Guest checkout signal in page text
    const bodyText = $('body').text();
    if (GUEST_RE.test(bodyText)) hasGuestCheckout = true;

    // ── Images ───────────────────────────────────────────────────────────────
    $('img').each((_, el) => {
      const alt        = $(el).attr('alt') ?? '';
      const src        = $(el).attr('src') ?? '';
      const role       = $(el).attr('role') ?? '';
      const decorative = role === 'presentation' || alt.trim() === '';
      if (!decorative && alt.trim() === '') missingAltCount++;
      images.push({ src, alt, decorative, pageUrl });
    });

    // Count images with no alt at all (not even empty)
    $('img:not([alt])').each(() => { missingAltCount++; });

    // ── Anchors ───────────────────────────────────────────────────────────────
    $('a').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const text = $(el).text().trim();
      anchors.push({ href, text, pageUrl });

      // Legal doc detection via anchor href/text
      const combined = `${href} ${text}`;
      if (TERMS_RE.test(combined))   hasTerms   = true;
      if (PRIVACY_RE.test(combined)) hasPrivacy = true;
      if (COOKIES_RE.test(combined)) hasCookies = true;
    });

    // ── Payment methods ───────────────────────────────────────────────────────
    const htmlLower = page.html.toLowerCase();
    for (const token of PAYMENT_TOKENS) {
      if (htmlLower.includes(token.toLowerCase())) {
        paymentSet.add(token);
      }
    }

    // ── Form fields ───────────────────────────────────────────────────────────
    $('form').each((_, form) => {
      $(form).find('input').each((_, el) => {
        const name        = normalize($(el).attr('name') ?? $(el).attr('id') ?? '');
        const inputType   = ($(el).attr('type') ?? 'text').toLowerCase();
        const required    = $(el).is('[required]');
        const placeholder = $(el).attr('placeholder') ?? '';

        // Resolve label
        const id    = $(el).attr('id') ?? '';
        let label = '';
        if (id) {
          label = $(`label[for="${id}"]`).text().trim();
        }
        if (!label) {
          label = $(el).closest('label').text().trim();
        }
        if (!label) {
          label = $(el).attr('aria-label') ?? '';
        }

        if (!label && required) missingLabelCount++;

        if (inputType !== 'hidden' && inputType !== 'submit' && inputType !== 'button') {
          forms.push({ name, inputType, required, label, pageUrl });
          inputs.push({ name, inputType, required, placeholder, label, pageUrl });
        }
      });

      // ── Selects ────────────────────────────────────────────────────────────
      $(form).find('select').each((_, el) => {
        const name     = normalize($(el).attr('name') ?? $(el).attr('id') ?? '');
        const required = $(el).is('[required]');
        const id       = $(el).attr('id') ?? '';
        let label = '';
        if (id) label = $(`label[for="${id}"]`).text().trim();
        if (!label) label = $(el).attr('aria-label') ?? '';

        const options: SelectOption[] = [];
        $(el).find('option').each((_, opt) => {
          const value = ($(opt).val() as string) ?? '';
          const text  = $(opt).text().trim();
          if (value || text) options.push({ value: normalize(value), text: normalize(text) });
        });

        selects.push({ name, label: normalize(label), required, options, pageUrl });

        // Missing label check
        if (!label && required) missingLabelCount++;
      });

      // ── Radio groups ───────────────────────────────────────────────────────
      const radioNames = new Set<string>();
      $(form).find('input[type="radio"]').each((_, el) => {
        const n = normalize($(el).attr('name') ?? '');
        if (n) radioNames.add(n);
      });

      radioNames.forEach((radioName) => {
        const els = $(form).find(
          `input[type="radio"][name="${radioName}"]`
        );
        const options: string[] = [];
        const labelEl           = $(form).find(`label[for="${radioName}"]`).text().trim();

        els.each((_, el) => {
          const val = normalize(($(el).val() as string) ?? $(el).attr('id') ?? '');
          if (val) options.push(val);
        });

        if (options.length > 0) {
          radios.push({
            name: radioName,
            label: normalize(labelEl),
            options,
            pageUrl,
          });
        }
      });
    });
  }

  // Determine isB2C: true when no B2B-only signals found
  const allText = pages.map((p) => p.html).join(' ').toLowerCase();
  const b2bSignals = ['empresa', 'company', 'cif', 'vat number', 'b2b', 'business account'];
  const isB2C = !b2bSignals.some((sig) => allText.includes(sig));

  return {
    url: entryUrl,
    market: 'EU',
    isB2C,

    detectedPages: {
      hasCheckout,
      hasRegister,
      hasGuestCheckout,
    },

    forms,
    selects,
    radios,
    inputs,
    images,
    anchors,

    accessibility: {
      missingAltCount,
      missingLabelCount,
      missingLangAttribute: missingLangAttr,
    },

    paymentMethods: [...paymentSet],

    legalDocuments: {
      hasTerms,
      hasPrivacy,
      hasCookies,
    },
  };
}
