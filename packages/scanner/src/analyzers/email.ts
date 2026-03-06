import { BrowserContext, Page } from 'playwright';
import { PageResult } from '../crawler';

export interface EAIProbeResult {
  /** Pages where an email field was found */
  pagesWithEmailField: string[];
  /** Whether ASCII email was accepted */
  asciiAccepted: boolean;
  /** Whether Unicode email was accepted */
  unicodeAccepted: boolean;
  /** Error messages seen when submitting Unicode email */
  unicodeRejectionMessages: string[];
  /** URLs where probing occurred */
  probedUrls: string[];
}

const UNICODE_EMAIL = 'josé@correo.es';
const ASCII_EMAIL = 'test.user@example.com';

async function probeEmailField(
  page: Page,
  pageUrl: string
): Promise<{ asciiOk: boolean; unicodeOk: boolean; rejectionMsg: string }> {
  try {
    const emailInput = await page.$('input[type="email"], input[name*="email"], input[id*="email"]');
    if (!emailInput) return { asciiOk: true, unicodeOk: true, rejectionMsg: '' };

    // Probe Unicode email
    await emailInput.click({ clickCount: 3 }).catch(() => {});
    await emailInput.fill(UNICODE_EMAIL);

    // Trigger validation (blur or input event)
    await emailInput.press('Tab');
    await page.waitForTimeout(500);

    const errorBefore = await page.$$eval(
      '[class*="error"],[class*="invalid"],[aria-invalid="true"],[class*="alert"]',
      (els: Element[]) => els.map((e) => (e as HTMLElement).innerText).join(' ')
    ).catch(() => '');

    // Also check HTML5 validity
    const unicodeValid = await page.evaluate((sel: string) => {
      const el = (document as Document).querySelector(sel) as HTMLInputElement | null;
      return el ? el.validity.valid : true;
    }, 'input[type="email"], input[name*="email"], input[id*="email"]').catch(() => true);

    const unicodeOk = unicodeValid && !errorBefore;

    // Probe ASCII email
    await emailInput.click({ clickCount: 3 }).catch(() => {});
    await emailInput.fill(ASCII_EMAIL);
    await emailInput.press('Tab');
    await page.waitForTimeout(300);
    const asciiValid = await page.evaluate((sel: string) => {
      const el = (document as Document).querySelector(sel) as HTMLInputElement | null;
      return el ? el.validity.valid : true;
    }, 'input[type="email"], input[name*="email"], input[id*="email"]').catch(() => true);

    return {
      asciiOk: asciiValid,
      unicodeOk,
      rejectionMsg: unicodeOk ? '' : errorBefore,
    };
  } catch {
    return { asciiOk: true, unicodeOk: true, rejectionMsg: '' };
  }
}

export async function analyzeEAI(
  context: BrowserContext,
  pages: PageResult[]
): Promise<EAIProbeResult> {
  const result: EAIProbeResult = {
    pagesWithEmailField: [],
    asciiAccepted: true,
    unicodeAccepted: true,
    unicodeRejectionMessages: [],
    probedUrls: [],
  };

  // Only probe pages with forms
  const formPages = pages.filter((p) => p.hasForm).slice(0, 5);

  for (const pg of formPages) {
    let page: Page | null = null;
    try {
      page = await context.newPage();
      await page.goto(pg.url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      await page.waitForTimeout(500);

      const hasEmail = await page.$('input[type="email"], input[name*="email"], input[id*="email"]');
      if (!hasEmail) continue;

      result.pagesWithEmailField.push(pg.url);
      result.probedUrls.push(pg.url);

      const { asciiOk, unicodeOk, rejectionMsg } = await probeEmailField(page, pg.url);
      if (!asciiOk) result.asciiAccepted = false;
      if (!unicodeOk) {
        result.unicodeAccepted = false;
        if (rejectionMsg) result.unicodeRejectionMessages.push(`${pg.url}: ${rejectionMsg}`);
      }
    } catch { /* skip */ }
    finally {
      if (page) await page.close().catch(() => {});
    }
  }

  return result;
}
