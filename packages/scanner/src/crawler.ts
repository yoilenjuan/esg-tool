import { Browser, BrowserContext, Page } from 'playwright';
import { ScannerConfig } from './config';

export interface PageResult {
  url: string;
  title: string;
  html: string;
  /** Whether the page contains at least one <form> */
  hasForm: boolean;
  pageType: PageType;
}

export type PageType =
  | 'landing'
  | 'register'
  | 'login'
  | 'checkout'
  | 'newsletter'
  | 'contact'
  | 'careers'
  | 'product'
  | 'other';

const FORM_PATTERNS: Record<PageType, RegExp> = {
  register: /registro|register|sign.?up|create.?account|nueva.?cuenta/i,
  login: /login|iniciar.?sesi[oó]n|sign.?in|acceder/i,
  checkout: /checkout|pago|payment|carrito|cart|basket/i,
  newsletter: /newsletter|suscri|subscribe/i,
  contact: /contact|contacto|mensaje|ayuda|help/i,
  careers: /empleo|careers|jobs|trabaja|vacantes/i,
  landing: /^\/?\s*$|home|inicio/i,
  product: /product|producto|item|articulo/i,
  other: /.*/,
};

function classifyPage(url: string, title: string): PageType {
  const check = `${url} ${title}`.toLowerCase();
  for (const [type, re] of Object.entries(FORM_PATTERNS) as [PageType, RegExp][]) {
    if (type === 'other') continue;
    if (re.test(check)) return type;
  }
  return 'other';
}

function normalizeUrl(href: string, base: string): string | null {
  try {
    const u = new URL(href, base);
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

function isSameDomain(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

async function checkRobots(origin: string): Promise<Set<string>> {
  const disallowed = new Set<string>();
  try {
    const res = await fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return disallowed;
    const text = await res.text();
    const lines = text.split('\n');
    let applicable = false;
    for (const raw of lines) {
      const line = raw.trim();
      if (/^user-agent:\s*\*/i.test(line)) { applicable = true; continue; }
      if (/^user-agent:/i.test(line)) { applicable = false; continue; }
      if (applicable && /^disallow:\s*/i.test(line)) {
        const path = line.replace(/^disallow:\s*/i, '').trim();
        if (path) disallowed.add(path);
      }
    }
  } catch { /* ignore */ }
  return disallowed;
}

function isDisallowed(url: string, disallowed: Set<string>): boolean {
  try {
    const pathname = new URL(url).pathname;
    for (const d of disallowed) {
      if (pathname.startsWith(d)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function crawl(
  context: BrowserContext,
  startUrl: string,
  config: ScannerConfig,
  onProgress: (scraped: number, discovered: number) => void
): Promise<PageResult[]> {
  const origin = new URL(startUrl).origin;
  const disallowed = await checkRobots(origin);

  const visited = new Set<string>();
  const queue: string[] = [startUrl];
  const results: PageResult[] = [];

  // Prioritise high-value form pages
  const PRIORITY_PATHS = [
    '/registro', '/register', '/signup', '/sign-up', '/create-account',
    '/login', '/iniciar-sesion', '/acceder', '/checkout', '/pago',
    '/newsletter', '/contact', '/contacto', '/empleo', '/careers',
  ];

  while (queue.length > 0 && results.length < config.maxPages) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    if (isDisallowed(url, disallowed)) continue;
    visited.add(url);

    let page: Page | null = null;
    try {
      page = await context.newPage();
      page.setDefaultNavigationTimeout(config.navigationTimeoutMs);
      await page.setExtraHTTPHeaders({ 'User-Agent': config.userAgent });

      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(config.rateDelayMs);

      const title = await page.title();
      const html = await page.content();
      const hasForm = (await page.$$('form')).length > 0;
      const pageType = classifyPage(url, title);

      results.push({ url, title, html, hasForm, pageType });
      onProgress(results.length, visited.size + queue.length);

      // Collect links
      const hrefs = await page.$$eval('a[href]', (els: Element[]) =>
        els.map((el) => (el as HTMLAnchorElement).href)
      );

      const newLinks = hrefs
        .map((h) => normalizeUrl(h, url))
        .filter((h): h is string => h !== null && isSameDomain(h, origin) && !visited.has(h));

      // Prioritise form-related paths
      const priority = newLinks.filter((l) =>
        PRIORITY_PATHS.some((p) => new URL(l).pathname.toLowerCase().includes(p))
      );
      const rest = newLinks.filter(
        (l) => !priority.includes(l)
      );

      for (const l of [...priority, ...rest]) {
        if (!queue.includes(l)) queue.push(l);
      }
    } catch (err) {
      // Non-fatal – skip the page
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  return results;
}
