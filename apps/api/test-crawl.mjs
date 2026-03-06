import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

chromium.use(StealthPlugin());

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 900 },
  extraHTTPHeaders: {
    'Accept-Language': 'es-ES,es;q=0.9,en-GB;q=0.8,en;q=0.7',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
  },
});
const page = await ctx.newPage();

const targets = [
  'https://www.zara.com/es/',
  'https://www.zalando.es/',
  'https://www.pccomponentes.com',
];

for (const url of targets) {
  try {
    const resp = await page.goto(url, { timeout: 20000, waitUntil: 'domcontentloaded' });
    const status = resp?.status();
    const title = await page.title();
    const linkCount = await page.evaluate(() => document.querySelectorAll('a[href]').length);
    console.log(`${url} -> ${status} "${title}" -- ${linkCount} links`);
  } catch (e) {
    console.log(`${url} -> ERROR: ${e.message}`);
  }
}

await browser.close();
