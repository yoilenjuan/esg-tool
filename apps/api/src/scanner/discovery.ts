/**
 * BFS page discovery — crawls the target site up to maxPages.
 * Priority is given to high-value page types (register, login, checkout, …).
 */
import type { BrowserContext, Page, Route, Request as PlaywrightRequest } from 'playwright';
import type { CrawledPage, PageCategory, ScannerRunConfig } from '../types/run';

// ─── Priority URL patterns ────────────────────────────────────────────────────
const PRIORITY_PATTERNS: RegExp[] = [
  /\b(register|registro|registr[ao]|sign.?up|crear.?cuenta|nueva.?cuenta)\b/i,
  /\b(login|log.?in|iniciar.?sesi[oó]n|acceso|entrar)\b/i,
  /\b(checkout|tramitar|pago|basket|bolsa)\b/i,
  /\b(cart|carrito|cesta)\b/i,
  /\b(account|mi.?cuenta|perfil|cuenta)\b/i,
  /\b(newsletter|suscribi|subscrib)\b/i,
  /\b(contact[ao]?|contacto|help|ayuda)\b/i,
  /\b(trabaja|careers|empleo|jobs)\b/i,
];

// ─── Blocked resource types (for fast crawling) ───────────────────────────────
const BLOCKED_TYPES = new Set(['image', 'media', 'font', 'stylesheet']);

// ─── Category detector ────────────────────────────────────────────────────────
function categorizePage(url: string): PageCategory {
  const u = url.toLowerCase();
  if (/register|registro|sign.?up|crear.?cuenta/.test(u)) return 'register';
  if (/login|log.?in|iniciar|acceso|entrar/.test(u)) return 'login';
  if (/checkout|tramitar|pago/.test(u)) return 'checkout';
  if (/cart|carrito|cesta|basket/.test(u)) return 'cart';
  if (/account|mi-cuenta|perfil/.test(u)) return 'account';
  if (/newsletter|suscribi|subscrib/.test(u)) return 'newsletter';
  if (/contact|ayuda/.test(u)) return 'contact';
  if (/trabaja|careers|empleo|jobs/.test(u)) return 'careers';
  const path = (() => { try { return new URL(url).pathname; } catch { return url; } })();
  if (path === '/' || path === '') return 'home';
  return 'other';
}

// ─── Robots.txt fetch ─────────────────────────────────────────────────────────
async function getRobotsDisallowed(origin: string): Promise<Set<string>> {
  const disallowed = new Set<string>();
  try {
    const res = await fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return disallowed;
    const text = await res.text();
    let inDefault = false;
    for (const line of text.split('\n')) {
      const l = line.trim();
      if (/^user-agent:\s*\*/i.test(l)) { inDefault = true; continue; }
      if (/^user-agent:/i.test(l)) { inDefault = false; continue; }
      if (inDefault && /^disallow:\s*/i.test(l)) {
        const p = l.replace(/^disallow:\s*/i, '').trim();
        if (p) disallowed.add(p);
      }
    }
  } catch {
    // robots.txt not available — proceed without restrictions
  }
  return disallowed;
}

function isDisallowed(url: string, origin: string, disallowed: Set<string>): boolean {
  try {
    const parsed = new URL(url, origin);
    const p = parsed.pathname;
    for (const d of disallowed) {
      if (p.startsWith(d)) return true;
    }
  } catch {
    return true;
  }
  return false;
}

// ─── Extract same-origin links ────────────────────────────────────────────────
async function extractLinks(page: Page, origin: string): Promise<string[]> {
  const hrefs: string[] = await page.$$eval(
    'a[href]',
    (anchors: Element[]) => anchors.map((a) => (a as HTMLAnchorElement).href),
  );

  const links: string[] = [];
  for (const href of hrefs) {
    try {
      const u = new URL(href);
      if (u.origin !== origin) continue;
      // Strip query and fragment, keep pathname
      u.search = '';
      u.hash = '';
      links.push(u.toString());
    } catch {
      // relative or broken — skip
    }
  }
  return [...new Set(links)];
}

// ─── Sort queue by priority ───────────────────────────────────────────────────
function sortByPriority(urls: string[]): string[] {
  const score = (u: string) => {
    for (let i = 0; i < PRIORITY_PATTERNS.length; i++) {
      if (PRIORITY_PATTERNS[i].test(u)) return PRIORITY_PATTERNS.length - i;
    }
    return 0;
  };
  return [...urls].sort((a, b) => score(b) - score(a));
}

// ─── Main discovery ───────────────────────────────────────────────────────────
export async function discoverPages(
  ctx: BrowserContext,
  config: ScannerRunConfig,
  onPageFound: (count: number) => void,
): Promise<CrawledPage[]> {
  const { baseUrl, origin, maxPages, navigationTimeoutMs, pageLoadDelayMs } = config;
  const disallowed = await getRobotsDisallowed(origin);

  const visited = new Set<string>();
  const queue: string[] = [baseUrl];
  const pages: CrawledPage[] = [];
  let page: Page | null = null;

  try {
    page = await ctx.newPage();

    // Block heavy resource types to speed up crawling
    await page.route('**/*', (route: Route, request: PlaywrightRequest) => {
      if (BLOCKED_TYPES.has(request.resourceType())) {
        route.abort().catch(() => {});
      } else {
        route.continue().catch(() => {});
      }
    });

    while (queue.length > 0 && pages.length < maxPages) {
      const raw = sortByPriority(queue.splice(0, queue.length));
      const url = raw.shift()!;
      // Put the rest back for next iteration
      queue.push(...raw);

      if (visited.has(url)) continue;
      if (isDisallowed(url, origin, disallowed)) continue;
      visited.add(url);

      const t0 = Date.now();
      let htmlContent = '';
      let visibleText = '';
      let title = '';
      let httpStatus = 0;
      let hasForm = false;

      try {
        const resp = await page.goto(url, {
          timeout: navigationTimeoutMs,
          waitUntil: 'domcontentloaded',
        });
        httpStatus = resp?.status() ?? 0;

        // Only recurse 2xx pages
        if (httpStatus >= 400) {
          onPageFound(pages.length);
          continue;
        }

        // Small wait for SPA rendering
        await page.waitForTimeout(pageLoadDelayMs);

        [htmlContent, title, hasForm, visibleText] = await page.evaluate(() => {
          const html = document.documentElement.outerHTML;
          const t = document.title ?? '';
          const f = !!(
            document.querySelector('form') ||
            document.querySelectorAll('input, select').length >= 2
          );
          const text = (document.body?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 50_000);
          return [html, t, f, text];
        });

        // Extract links for BFS
        const links = await extractLinks(page, origin);
        for (const link of links) {
          if (!visited.has(link) && !queue.includes(link)) {
            queue.push(link);
          }
        }
      } catch {
        // Navigation error — record partial info
        httpStatus = httpStatus || -1;
      }

      const crawled: CrawledPage = {
        url,
        title,
        html: htmlContent,
        visibleText,
        category: categorizePage(url),
        hasForm,
        httpStatus,
        loadTimeMs: Date.now() - t0,
        crawledAt: new Date().toISOString(),
      };

      pages.push(crawled);
      onPageFound(pages.length);
    }
  } finally {
    await page?.close().catch(() => {});
  }

  return pages;
}
