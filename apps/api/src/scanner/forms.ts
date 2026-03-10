/**
 * Form field detection — classifies inputs on a page into ESG-relevant categories.
 * Works for both traditional <form>-based and SPA-style pages.
 */
import type { BrowserContext } from 'playwright';
import type { CrawledPage, FormAnalysis, DetectedField, FormFieldCategory, FieldOption } from '../types/run';

// ─── Classification patterns ──────────────────────────────────────────────────
// NOTE — categories are checked in order; the FIRST match wins.
// Keep more specific patterns (legal_document, nationality) BEFORE broader
// ones (country) so that e.g. "country_of_birth" is not taken by 'country'.
const CATEGORY_PATTERNS: Array<{ category: FormFieldCategory; patterns: RegExp[] }> = [
  {
    category: 'email',
    patterns: [
      /\bemail\b/i,
      /\bcorreo\b/i,
      /\be.?mail\b/i,
    ],
  },
  // ── legal_document before nationality/country so DNI/NIE/passport win ─────
  {
    category: 'legal_document',
    patterns: [
      /\bdni\b/i,
      /\bnif\b/i,
      /\bnie\b/i,
      /\bpassport\b/i,
      /\bpasaporte\b/i,
      /\bidentification[\s_]?(number|type|card)?\b/i,
      /\bid[\s_]?card\b/i,
      /\bdocumento[\s_]?(nacional|identidad|type)?\b/i,
      /\bsocial[\s_]?security\b/i,
      /\bssn\b/i,
      /\bdocument[\s_]?type\b/i,
    ],
  },
  // ── nationality before country so "country_of_birth" is caught here ────────
  {
    category: 'nationality',
    patterns: [
      /\bnationality\b/i,               // exact word — avoids "national savings" etc.
      /\bnacionalidad\b/i,
      /\bcountry[\s_.]?of[\s_.]?birth\b/i,
      /\bpa[ií]s[\s_.]?de[\s_.]?nacimiento\b/i,
      /\bbirthplace\b/i,
      /\bpa[ií]s[\s_.]?nacimiento\b/i,
    ],
  },
  // ── gender — includes title/salutation fields (EN + ES + FR + DE) ──────────
  {
    category: 'gender',
    patterns: [
      /\bgender\b/i,
      /\bsex\b(?!ual)/i,              // "sex" but not "sexual"
      /\bg[eé]nero\b/i,
      /\bsexo\b/i,
      /\bpronoun\b/i,
      // Title / salutation / honorific — EN + ES + FR + DE + NL
      /\b(title|salutation|honorific)\b/i,
      /\b(tratamiento|t[ií]tulo|salutaci[oó]n)\b/i,  // ES
      /\bcivility\b/i,                // EN/FR: "civility" dropdown
      /\bprefix\b/i,                  // very common: field name "prefix" = Mr/Mrs
      /\banrede\b/i,                  // DE: "Anrede"
      /\baanhef\b/i,                  // NL
    ],
  },
  // ── country: billing/shipping/residence — NOT region (= state/province) ───
  {
    category: 'country',
    patterns: [
      /\bcountry\b/i,                   // "country", "country_code", "shippingCountry"
      /\bpa[ií]s\b/i,                   // Spanish "país"
      /\bcountry[\s_.]?of[\s_.]?residence\b/i,
      /\bcountry[\s_.]?code\b/i,
      /\bshipping[\s_.]?country\b/i,
      /\bbilling[\s_.]?country\b/i,
      /\bdelivery[\s_.]?country\b/i,
      /\b(shipping|billing|delivery)Address\.country\b/i,
    ],
  },
  // ── civil/marital status — narrowed to avoid "civil engineer" false hits ──
  {
    category: 'civil_status',
    patterns: [
      /\bmarital[\s_.]?status\b/i,
      /\bcivil[\s_.]?status\b/i,
      /\bcivil[\s_.]?state\b/i,
      /\bestado[\s_.]?civil\b/i,
      /\brelationship[\s_.]?status\b/i,
    ],
  },
  // ── age / date of birth ────────────────────────────────────────────────────
  {
    category: 'age_dob',
    patterns: [
      /\bage\b/i,
      /\bdob\b/i,
      /\bdate[\s_.]?of[\s_.]?birth\b/i,
      /\bbirth[\s_.]?date\b/i,
      /\bbirthday\b/i,
      /\bbirth[\s_.]?year\b/i,
      /\byear[\s_.]?of[\s_.]?birth\b/i,
      /\bfecha[\s_.]?nac(imiento)?\b/i,
      /\bnacimiento\b/i,
    ],
  },
];

// ─── Option-text gender-title detector ──────────────────────────────────────
// If a select/radio has few options and at least one matches a well-known
// title token, it is very likely a salutation field regardless of field name.
// Examples: ["Sr.", "Sra.", "Dr."], ["Mr", "Mrs", "Ms", "Mx"], ["Herr", "Frau"]
const GENDER_TITLE_OPTION_RE =
  /\b(sr|sra|srt|señor|señora|don|doña|mr|mrs|ms|miss|mx|dr|dra|prof|herr|frau|m\.?me|monsieur|madame)\b\.?/i;

function hasGenderTitleOptions(options: Array<{ value: string; label: string }>): boolean {
  // Title dropdowns typically have 2–10 entries
  if (options.length === 0 || options.length > 12) return false;
  return options.some(
    (o) => GENDER_TITLE_OPTION_RE.test(o.label) || GENDER_TITLE_OPTION_RE.test(o.value),
  );
}

function classifyField(
  name: string,
  id: string,
  label: string,
  placeholder: string,
  ariaLabel: string,
  options: Array<{ value: string; label: string }> = [],
): FormFieldCategory {
  const haystack = [name, id, label, placeholder, ariaLabel].join(' ');
  for (const { category, patterns } of CATEGORY_PATTERNS) {
    for (const p of patterns) {
      if (p.test(haystack)) return category;
    }
  }
  // Fallback: inspect option text for gender title tokens
  if (hasGenderTitleOptions(options)) return 'gender';
  return 'other';
}

// ─── Main analysis function ───────────────────────────────────────────────────
export async function analyseForms(
  ctx: BrowserContext,
  pages: CrawledPage[],
): Promise<FormAnalysis> {
  const allFields: DetectedField[] = [];
  const pagesWithForms: string[] = [];

  // Only analyse pages that are likely to have forms
  const formPages = pages.filter((p) =>
    p.hasForm ||
    p.category === 'register' ||
    p.category === 'login' ||
    p.category === 'account' ||
    p.category === 'checkout' ||
    p.category === 'cart' ||
    p.category === 'contact' ||
    p.category === 'newsletter' ||
    p.category === 'careers',
  );

  const page = await ctx.newPage();
  try {
    for (const crawledPage of formPages) {
      try {
        await page.goto(crawledPage.url, { timeout: 25_000, waitUntil: 'domcontentloaded' });
        // SPAs (React / Angular / Vue) render forms via JS after the initial HTML load.
        // Wait for the network to settle so components have time to mount.
        try {
          await page.waitForLoadState('networkidle', { timeout: 4_000 });
        } catch { /* timeout acceptable — continue with whatever rendered */ }
        await page.waitForTimeout(1_200);

        const fields = await page.evaluate((): Array<{
          tagName: string;
          inputType: string;
          name: string;
          id: string;
          label: string;
          ariaLabel: string;
          placeholder: string;
          required: boolean;
          selector: string;
          options: Array<{ value: string; label: string }>;
        }> => {
          const results: Array<{
            tagName: string;
            inputType: string;
            name: string;
            id: string;
            label: string;
            ariaLabel: string;
            placeholder: string;
            required: boolean;
            selector: string;
            options: Array<{ value: string; label: string }>;
          }> = [];

          const labelMap = new Map<string, string>();
          document.querySelectorAll('label').forEach((lEl) => {
            const forAttr = lEl.getAttribute('for');
            if (forAttr) labelMap.set(forAttr, lEl.textContent?.trim() ?? '');
          });

          const getLabel = (el: Element): string => {
            const id = el.getAttribute('id') ?? '';
            if (id && labelMap.has(id)) return labelMap.get(id)!;
            // Walk up to find a wrapping label
            let cur = el.parentElement;
            while (cur) {
              if (cur.tagName === 'LABEL') return cur.textContent?.trim() ?? '';
              cur = cur.parentElement;
            }
            return '';
          };

          const getSelector = (el: Element): string => {
            const id = el.getAttribute('id');
            if (id) return `#${CSS.escape(id)}`;
            const name = el.getAttribute('name');
            if (name) return `${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
            return el.tagName.toLowerCase();
          };

          document.querySelectorAll('input, select, textarea').forEach((el) => {
            const inputEl = el as HTMLInputElement;
            const type = inputEl.type || el.tagName.toLowerCase();
            if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) return;

            const opts: Array<{ value: string; label: string }> = [];
            if (el.tagName === 'SELECT') {
              (el as HTMLSelectElement).options && Array.from((el as HTMLSelectElement).options).forEach((o) => {
                opts.push({ value: o.value, label: o.text.trim() });
              });
            }

            // Get radio options from siblings
            if (type === 'radio') {
              const name = inputEl.name;
              if (name) {
                document.querySelectorAll(`input[type="radio"][name="${name}"]`).forEach((r) => {
                  const rv = (r as HTMLInputElement).value;
                  const rl = getLabel(r);
                  if (!opts.some((o) => o.value === rv)) opts.push({ value: rv, label: rl || rv });
                });
              }
            }

            results.push({
              tagName: el.tagName.toLowerCase(),
              inputType: type,
              name: inputEl.name ?? '',
              id: inputEl.id ?? '',
              label: getLabel(el),
              ariaLabel: el.getAttribute('aria-label') ?? '',
              placeholder: inputEl.placeholder ?? '',
              required: inputEl.required ?? false,
              selector: getSelector(el),
              options: opts,
            });
          });

          return results;
        });

        if (fields.length > 0) {
          pagesWithForms.push(crawledPage.url);
          for (const f of fields) {
            const category = classifyField(f.name, f.id, f.label, f.placeholder, f.ariaLabel, f.options);
            allFields.push({
              ...f,
              category,
              pageUrl: crawledPage.url,
            });
          }
        }
      } catch {
        // Page failed to load for form analysis — skip
      }
    }
  } finally {
    await page.close().catch(() => {});
  }

  // Deduplicate: keep first occurrence of each (url + selector)
  const seen = new Set<string>();
  const unique = allFields.filter((f) => {
    const key = `${f.pageUrl}::${f.selector}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { pagesWithForms, fields: unique };
}
