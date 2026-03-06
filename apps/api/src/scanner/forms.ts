/**
 * Form field detection — classifies inputs on a page into ESG-relevant categories.
 * Works for both traditional <form>-based and SPA-style pages.
 */
import type { BrowserContext } from 'playwright';
import type { CrawledPage, FormAnalysis, DetectedField, FormFieldCategory, FieldOption } from '../types/run';

// ─── Classification patterns ──────────────────────────────────────────────────
const CATEGORY_PATTERNS: Array<{ category: FormFieldCategory; patterns: RegExp[] }> = [
  {
    category: 'email',
    patterns: [
      /\bemail\b/i,
      /\bcorreo\b/i,
      /\be.?mail\b/i,
    ],
  },
  {
    category: 'gender',
    patterns: [
      /\bgender\b/i,
      /\bsex\b/i,
      /\bg[eé]nero\b/i,
      /\bsexo\b/i,
      /\bpronoun\b/i,
    ],
  },
  {
    category: 'nationality',
    patterns: [
      /\bnational\b/i,
      /\bnacionalidad\b/i,
      /\bnacionality\b/i,
      /\bcountry.?of.?birth\b/i,
      /\bpa[ií]s.?de.?nacimiento\b/i,
      /\bbirthplace\b/i,
    ],
  },
  {
    category: 'country',
    patterns: [
      /\bcountry\b/i,
      /\bpa[ií]s\b/i,
      /\bcountry.?of.?residence\b/i,
      /\bregion\b/i,
    ],
  },
  {
    category: 'civil_status',
    patterns: [
      /\bmarital\b/i,
      /\bcivil\b/i,
      /\bstate.?civil\b/i,
      /\bestado.?civil\b/i,
      /\brelationship.?status\b/i,
    ],
  },
  {
    category: 'age_dob',
    patterns: [
      /\bage\b/i,
      /\bdob\b/i,
      /\bdate.?of.?birth\b/i,
      /\bbirth.?date\b/i,
      /\bfecha.?nac\b/i,
      /\bnacimiento\b/i,
    ],
  },
  {
    category: 'legal_document',
    patterns: [
      /\bdni\b/i,
      /\bnif\b/i,
      /\bnie\b/i,
      /\bpassport\b/i,
      /\bpasaporte\b/i,
      /\bidentification\b/i,
      /\bid.?card\b/i,
      /\bdocumento\b/i,
      /\bsocial.?security\b/i,
      /\bssn\b/i,
    ],
  },
];

function classifyField(name: string, id: string, label: string, placeholder: string, ariaLabel: string): FormFieldCategory {
  const haystack = [name, id, label, placeholder, ariaLabel].join(' ');
  for (const { category, patterns } of CATEGORY_PATTERNS) {
    for (const p of patterns) {
      if (p.test(haystack)) return category;
    }
  }
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
    p.category === 'checkout' ||
    p.category === 'contact' ||
    p.category === 'newsletter' ||
    p.category === 'careers',
  );

  const page = await ctx.newPage();
  try {
    for (const crawledPage of formPages) {
      try {
        await page.goto(crawledPage.url, { timeout: 20_000, waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(800);

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
            const category = classifyField(f.name, f.id, f.label, f.placeholder, f.ariaLabel);
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
