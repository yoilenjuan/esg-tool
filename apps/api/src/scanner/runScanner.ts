/**
 * Main scan orchestrator.
 * Coordinates discovery → forms → EAI probe → language → visual → summarize → PDF.
 */
import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

chromium.use(StealthPlugin());
import type {
  ScannerRunConfig,
  ScanRunResult,
  ProgressCallback,
  EvidenceRecord,
  CrawledPage,
  PageCategory,
} from '../types/run';
import { discoverPages } from './discovery';
import { analyseForms } from './forms';
import { probeEmailEAI } from './emailEaiProbe';
import { analyseLanguageBias } from './languageBias';
import { analyseVisualDiversity } from './visualDiversity';
import { summariseDimensions, buildSalesImpactSummary } from './summarize';
import { buildVideoEvidence } from './evidence';
import { generatePdfReport } from '../report/pdf';
import { RetailRuleEngine, buildRetailSnapshot } from '@esg/scanner';
import type { PageResult } from '@esg/scanner';
import type { RetailRiskLevel } from '../types/run';

// ─── Category → PageType adapter ─────────────────────────────────────────────
const CAT_TO_PAGE_TYPE: Record<PageCategory, PageResult['pageType']> = {
  home:        'landing',
  register:    'register',
  login:       'login',
  checkout:    'checkout',
  cart:        'checkout',
  account:     'other',
  newsletter:  'newsletter',
  contact:     'contact',
  careers:     'careers',
  marketing:   'landing',
  product:     'product',
  other:       'other',
};

function toPageResults(pages: CrawledPage[]): PageResult[] {
  return pages.map((p) => ({
    url:      p.url,
    title:    p.title,
    html:     p.html,
    hasForm:  p.hasForm,
    pageType: CAT_TO_PAGE_TYPE[p.category] ?? 'other',
  }));
}

// ─── Conversion exposure sub-score ────────────────────────────────────────────
function deriveConversionExposure(
  breakdown: Record<string, { score: number; findings: string[] }>,
): { conversionExposureScore: number; conversionExposureLevel: RetailRiskLevel } {
  const CONV_WEIGHTS = { checkoutFriction: 0.18, paymentInclusivity: 0.15, genderInclusion: 0.18 };
  const totalWeight  = Object.values(CONV_WEIGHTS).reduce((a, b) => a + b, 0);

  let weighted = 0;
  for (const [key, w] of Object.entries(CONV_WEIGHTS)) {
    weighted += (breakdown[key]?.score ?? 100) * w;
  }
  const conversionExposureScore = Math.round(weighted / totalWeight);

  const conversionExposureLevel: RetailRiskLevel =
    conversionExposureScore < 40 ? 'Critical' :
    conversionExposureScore < 60 ? 'High' :
    conversionExposureScore < 75 ? 'Medium' : 'Low';

  return { conversionExposureScore, conversionExposureLevel };
}

// ─── ScanOptions subset (mirrors shared type) ─────────────────────────────────
export interface ApiScanOptions {
  url: string;
  depth: 'light' | 'standard' | 'deep';
  recordVideo: boolean;
  maxPages: number;
  languageToolUrl?: string;
}

// ─── Depth → maxPages map ─────────────────────────────────────────────────────
const DEPTH_PAGES: Record<ApiScanOptions['depth'], number> = {
  light: 5,
  standard: 20,
  deep: 50,
};

// ─── Build internal config ────────────────────────────────────────────────────
function buildConfig(
  runId: string,
  options: ApiScanOptions,
  runsDir: string,
): ScannerRunConfig {
  const runDir = path.join(runsDir, runId);
  const screenshotsDir = path.join(runDir, 'screenshots');
  const videosDir = path.join(runDir, 'videos');

  fs.mkdirSync(screenshotsDir, { recursive: true });
  fs.mkdirSync(videosDir, { recursive: true });

  const origin = (() => {
    try { return new URL(options.url).origin; } catch { return options.url; }
  })();

  const effectiveMaxPages = options.maxPages > 0
    ? options.maxPages
    : DEPTH_PAGES[options.depth ?? 'standard'];

  return {
    runId,
    baseUrl: options.url,
    origin,
    maxPages: effectiveMaxPages,
    depth: options.depth ?? 'standard',
    recordVideo: options.recordVideo ?? false,
    runDir,
    screenshotsDir,
    videosDir,
    navigationTimeoutMs: 30_000,
    pageLoadDelayMs: 500,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  };
}

// ─── Partial result saver (on error) ─────────────────────────────────────────
function savePartial(runDir: string, data: Partial<ScanRunResult>): void {
  try {
    const outPath = path.join(runDir, 'report.json');
    fs.writeFileSync(outPath, JSON.stringify({ ...data, status: 'failed', _partial: true }, null, 2));
  } catch {
    // best-effort
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────
export async function runApiScan(
  options: ApiScanOptions,
  runsDir: string,
  runId: string,
  onProgress: ProgressCallback,
): Promise<ScanRunResult> {
  const config = buildConfig(runId, options, runsDir);
  const { runDir, screenshotsDir, videosDir, recordVideo } = config;

  const startedAt = new Date().toISOString();
  const allEvidences: EvidenceRecord[] = [];

  const progress = (step: string, pct: number, pagesFound = 0, pagesScanned = 0) => {
    onProgress({
      runId,
      status: 'running',
      currentStep: step,
      pagesDiscovered: pagesFound,
      pagesScanned,
      percentComplete: pct,
      startedAt,
    });
  };

  progress('Launching browser', 2);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  let videoPath: string | null = null;

  try {
    // Create single browser context (optionally with video)
    const ctx = await browser.newContext({
      userAgent: config.userAgent,
      viewport: { width: 1280, height: 900 },
      extraHTTPHeaders: {
        'Accept-Language': 'es-ES,es;q=0.9,en-GB;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Upgrade-Insecure-Requests': '1',
      },
      ...(recordVideo
        ? {
            recordVideo: {
              dir: videosDir,
              size: { width: 1280, height: 900 },
            },
          }
        : {}),
    });

    // Note: playwright-extra stealth plugin handles automation signal hiding
    await ctx.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Array;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Promise;
    });

    progress('Discovering pages', 5);

    // ── Phase 1: Discovery ────────────────────────────────────────────────────
    let discoveredCount = 0;    console.log(`[scanner] Starting crawl: ${options.url} (maxPages=${config.maxPages})`);    const crawledPages = await discoverPages(ctx, config, (count) => {
      discoveredCount = count;
      progress('Discovering pages', 5 + Math.min(count, config.maxPages) / config.maxPages * 20, discoveredCount, 0);
    });

    console.log(`[scanner] Crawled ${crawledPages.length} page(s): ${crawledPages.map((p) => `${p.url} [${p.httpStatus}]`).join(', ')}`);
    progress('Analysing forms', 30, crawledPages.length, crawledPages.length);

    // ── Phase 2: Form analysis ────────────────────────────────────────────────
    const formAnalysis = await analyseForms(ctx, crawledPages);

    progress('Probing EAI email', 45, crawledPages.length, crawledPages.length);

    // ── Phase 3: EAI probe ────────────────────────────────────────────────────
    const { analysis: eaiAnalysis, evidences: eaiEvidences } = await probeEmailEAI(
      ctx,
      crawledPages,
      config,
    );
    allEvidences.push(...eaiEvidences);

    progress('Analysing language bias', 60, crawledPages.length, crawledPages.length);

    // ── Phase 4: Language bias ────────────────────────────────────────────────
    const languageBias = await analyseLanguageBias(crawledPages, options.languageToolUrl);

    progress('Analysing visual diversity', 72, crawledPages.length, crawledPages.length);

    // ── Phase 5: Visual diversity ─────────────────────────────────────────────
    const visualDiversity = await analyseVisualDiversity(ctx, crawledPages);

    // ── Close context to flush video ──────────────────────────────────────────
    if (recordVideo) {
      const pages = await ctx.pages();
      if (pages.length > 0) {
        const vid = await pages[0].video()?.path();
        videoPath = vid ?? null;
      }
    }

    await ctx.close();

    if (recordVideo && videoPath) {
      const ev = await buildVideoEvidence(videoPath, options.url, videosDir, ['session']);
      if (ev) allEvidences.push(ev);
    }

    progress('Summarising findings', 82, crawledPages.length, crawledPages.length);

    // ── Phase 6: Summarise ────────────────────────────────────────────────────
    const dimensions = summariseDimensions(
      { formAnalysis, eaiAnalysis, languageBias, visualDiversity },
      allEvidences,
    );
    const salesImpactSummary = buildSalesImpactSummary(dimensions);

    // ── Phase 6b: Retail EU Risk Score ────────────────────────────────────────
    progress('Running Retail EU risk engine…', 86, crawledPages.length, crawledPages.length);

    let primaryScore: ScanRunResult['primaryScore'] | undefined;
    let conversionExposureScore: number | undefined;
    let conversionExposureLevel: RetailRiskLevel | undefined;

    try {
      const retailSnapshot = buildRetailSnapshot(options.url, toPageResults(crawledPages));
      const retailEngine   = new RetailRuleEngine();
      primaryScore         = retailEngine.evaluate(retailSnapshot);
      const conversionData = deriveConversionExposure(primaryScore.breakdown);
      conversionExposureScore = conversionData.conversionExposureScore;
      conversionExposureLevel = conversionData.conversionExposureLevel;
    } catch (retailErr) {
      console.warn('[runScanner] Retail engine failed (non-fatal):', retailErr);
    }

    progress('Generating PDF report', 90, crawledPages.length, crawledPages.length);

    // ── Phase 7: PDF ──────────────────────────────────────────────────────────
    let pdfPath: string | null = null;
    try {
      pdfPath = await generatePdfReport(
        {
          runId,
          status: 'completed',
          companyUrl: options.url,
          scannedAt: startedAt,
          completedAt: new Date().toISOString(),
          pagesScanned: crawledPages.map((p) => p.url),
          dimensions,
          evidences: allEvidences,
          salesImpactSummary,
          pdfPath: null,
          primaryScore,
          conversionExposureScore,
          conversionExposureLevel,
          _raw: { formAnalysis, eaiAnalysis, languageBias, visualDiversity },
        },
        runDir,
        browser,
      );
    } catch (pdfErr) {
      console.error('[runScanner] PDF generation failed:', pdfErr);
    }

    const completedAt = new Date().toISOString();

    const result: ScanRunResult = {
      runId,
      status: 'completed',
      companyUrl: options.url,
      scannedAt: startedAt,
      completedAt,
      pagesScanned: crawledPages.map((p) => p.url),
      dimensions,
      evidences: allEvidences,
      salesImpactSummary,
      pdfPath,
      primaryScore,
      conversionExposureScore,
      conversionExposureLevel,
      _raw: { formAnalysis, eaiAnalysis, languageBias, visualDiversity },
    };

    // Save report.json
    const reportPath = path.join(runDir, 'report.json');
    fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));

    onProgress({
      runId,
      status: 'completed',
      currentStep: 'Done',
      pagesDiscovered: crawledPages.length,
      pagesScanned: crawledPages.length,
      percentComplete: 100,
      startedAt,
      completedAt,
    });

    return result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    savePartial(runDir, {
      runId,
      companyUrl: options.url,
      scannedAt: startedAt,
    });
    onProgress({
      runId,
      status: 'failed',
      currentStep: 'Error',
      pagesDiscovered: 0,
      pagesScanned: 0,
      percentComplete: 0,
      startedAt,
      completedAt: new Date().toISOString(),
      errorMessage: msg,
    });
    throw err;
  } finally {
    await browser.close().catch(() => {});
  }
}
