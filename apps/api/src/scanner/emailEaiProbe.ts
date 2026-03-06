/**
 * Email Address Internationalisation (EAI) probe.
 * Tests whether email input fields accept Unicode email addresses as required by
 * RFC 6531 / SMTPUTF8. Detects rejection signals in the browser DOM.
 */
import type { BrowserContext } from 'playwright';
import type {
  CrawledPage,
  EAIAnalysis,
  EAIProbeAttempt,
  EAIProbeState,
  ScannerRunConfig,
} from '../types/run';
import type { EvidenceRecord } from '../types/run';
import { captureScreenshot } from './evidence';

// ─── Test email addresses ─────────────────────────────────────────────────────
const PROBES: Array<{ email: string; kind: EAIProbeAttempt['emailKind'] }> = [
  { email: 'test@example.com',  kind: 'ascii' },
  { email: 'josé@correo.es',    kind: 'unicode_latin' },
  { email: 'अजय@भारत.in',       kind: 'unicode_indic' },
];

// ─── DOM injection & result extraction ───────────────────────────────────────
async function probeEmailField(
  page: import('playwright').Page,
  selector: string,
  email: string,
): Promise<{ html5Invalid: boolean; validationMessage: string; errorClassDetected: boolean }> {
  return page.evaluate(
    ({ sel, val }: { sel: string; val: string }) => {
      const el = document.querySelector<HTMLInputElement>(sel);
      if (!el) return { html5Invalid: false, validationMessage: '', errorClassDetected: false };

      // Programmatic value injection
      const nativeInput = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      if (nativeInput?.set) nativeInput.set.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));

      const html5Invalid = !el.validity.valid;
      const validationMessage = el.validationMessage ?? '';

      // Error class heuristic: border-red, is-invalid, error, invalid, has-error
      const errorClassRe = /\b(error|invalid|is-invalid|has-error|border-red|field-error|input-error)\b/i;
      const classes = [
        el.className,
        el.closest('[class]')?.className ?? '',
      ].join(' ');
      const errorClassDetected = errorClassRe.test(classes);

      return { html5Invalid, validationMessage, errorClassDetected };
    },
    { sel: selector, val: email },
  );
}

async function extractVisibleError(page: import('playwright').Page): Promise<string> {
  return page.evaluate(() => {
    const errorSelectors = [
      '[role="alert"]',
      '.error', '.form-error', '.field-error', '.input-error',
      '[class*="error"]', '[class*="invalid"]',
      '[aria-invalid="true"] + *',
    ];
    for (const sel of errorSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = (el as HTMLElement).innerText?.trim();
        if (text && text.length > 2 && text.length < 300) return text;
      }
    }
    return '';
  });
}

// ─── Main probe orchestrator ──────────────────────────────────────────────────
export async function probeEmailEAI(
  ctx: BrowserContext,
  pages: CrawledPage[],
  config: ScannerRunConfig,
): Promise<{ analysis: EAIAnalysis; evidences: EvidenceRecord[] }> {
  const evidences: EvidenceRecord[] = [];
  const attempts: EAIProbeAttempt[] = [];
  const probedPages: string[] = [];

  // Only look at pages with email fields
  const emailPages = pages.filter((p) =>
    p.hasForm &&
    (p.category === 'register' ||
      p.category === 'login' ||
      p.category === 'newsletter' ||
      p.category === 'checkout' ||
      /email/i.test(p.html)),
  );

  if (emailPages.length === 0) {
    return {
      analysis: {
        probes: [],
        unicodeLatinRejected: false,
        unicodeIndicRejected: false,
        asciiAccepted: true,
        probedPages: [],
      },
      evidences: [],
    };
  }

  const page = await ctx.newPage();
  try {
    for (const crawledPage of emailPages.slice(0, 3)) {
      try {
        await page.goto(crawledPage.url, { timeout: 20_000, waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(600);

        // Find email input selectors
        const emailSelectors: string[] = await page.evaluate(() => {
          const sels: string[] = [];
          document.querySelectorAll('input').forEach((el) => {
            const combined = [
              el.type, el.name, el.id,
              el.getAttribute('placeholder') ?? '',
              el.getAttribute('aria-label') ?? '',
            ].join(' ').toLowerCase();
            if (/email|correo/.test(combined)) {
              const id = el.getAttribute('id');
              const name = el.getAttribute('name');
              sels.push(id ? `#${CSS.escape(id)}` : name ? `input[name="${CSS.escape(name)}"]` : 'input[type="email"]');
            }
          });
          return [...new Set(sels)];
        });

        if (emailSelectors.length === 0) continue;
        probedPages.push(crawledPage.url);

        const selector = emailSelectors[0];

        for (const probe of PROBES) {
          // Reset between probes
          await page.goto(crawledPage.url, { timeout: 20_000, waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(400);

          const domResult = await probeEmailField(page, selector, probe.email);
          const visibleError = await extractVisibleError(page);

          let state: EAIProbeState = 'unknown';
          if (domResult.html5Invalid || domResult.errorClassDetected || visibleError.length > 0) {
            state = 'rejected';
          } else if (probe.kind === 'ascii' && !domResult.html5Invalid) {
            state = 'accepted';
          } else {
            state = 'accepted';
          }

          let evidenceId: string | null = null;
          if (state === 'rejected') {
            const ev = await captureScreenshot(
              page,
              `EAI rejection: ${probe.email} → "${visibleError || domResult.validationMessage || 'html5 invalid'}"`,
              config.screenshotsDir,
              crawledPage.url,
              ['email_internationalization'],
            );
            evidences.push(ev);
            evidenceId = ev.id;
          }

          attempts.push({
            emailAddress: probe.email,
            emailKind: probe.kind,
            state,
            validationMessage: domResult.validationMessage,
            visibleError,
            html5Invalid: domResult.html5Invalid,
            errorClassDetected: domResult.errorClassDetected,
            evidenceId,
            pageUrl: crawledPage.url,
          });
        }
      } catch {
        // Skip page on error
      }
    }
  } finally {
    await page.close().catch(() => {});
  }

  const unicodeLatinRejected = attempts.some(
    (a) => a.emailKind === 'unicode_latin' && a.state === 'rejected',
  );
  const unicodeIndicRejected = attempts.some(
    (a) => a.emailKind === 'unicode_indic' && a.state === 'rejected',
  );
  const asciiAccepted = attempts.some(
    (a) => a.emailKind === 'ascii' && a.state === 'accepted',
  );

  return {
    analysis: {
      probes: attempts,
      unicodeLatinRejected,
      unicodeIndicRejected,
      asciiAccepted,
      probedPages,
    },
    evidences,
  };
}
