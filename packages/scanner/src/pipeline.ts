import * as path from 'path';
import * as fs from 'fs-extra';
import { chromium, BrowserContext } from 'playwright';
import { v4 as uuidv4 } from 'uuid';
import { ScanOptions, ScanRun, RunStatus, Evidence, ScanProgress } from '@esg/shared';
import { buildConfig } from './config';
import { crawl, PageResult } from './crawler';
import { analyzeGender } from './analyzers/gender';
import { analyzeEAI } from './analyzers/email';
import { analyzeNationality } from './analyzers/nationality';
import { analyzeCountry } from './analyzers/country';
import { analyzeCivilStatus } from './analyzers/civilStatus';
import { analyzeAge } from './analyzers/age';
import { analyzeRaceEthnicity } from './analyzers/raceEthnicity';
import { analyzeLegalDocument } from './analyzers/legalDocument';
import { analyzeLanguage } from './languageAnalyzer';
import { captureScreenshot } from './evidenceCapture';
import {
  buildGenderFinding,
  buildEAIFinding,
  buildNationalityFinding,
  buildCountryFinding,
  buildCivilStatusFinding,
  buildAgeFinding,
  buildRaceEthnicityFinding,
  buildLegalDocFinding,
} from './dimensionSummarizer';
import { RetailRuleEngine } from './retail/RetailRuleEngine';
import { buildRetailSnapshot } from './retail/RetailSnapshotBuilder';

export type ProgressCallback = (progress: ScanProgress) => void;

export async function runScan(
  options: ScanOptions,
  runsBaseDir: string,
  onProgress?: ProgressCallback
): Promise<ScanRun> {
  const runId = uuidv4();
  const outputDir = path.join(runsBaseDir, runId);
  await fs.ensureDir(outputDir);
  await fs.ensureDir(path.join(outputDir, 'screenshots'));

  const startedAt = new Date().toISOString();
  const config = buildConfig(outputDir, options.maxPages, options.depth, options.recordVideo);

  const emit = (step: string, pagesScanned = 0, pagesDiscovered = 0, percent = 0) => {
    if (!onProgress) return;
    onProgress({
      runId,
      status: 'running',
      currentStep: step,
      pagesDiscovered,
      pagesScanned,
      percentComplete: percent,
      startedAt,
    });
  };

  emit('Launching browser…', 0, 0, 2);

  const browser = await chromium.launch({ headless: true });
  const contextOptions: Parameters<typeof browser.newContext>[0] = {
    userAgent: config.userAgent,
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 800 },
  };
  if (config.recordVideo) {
    const videoDir = path.join(outputDir, 'videos');
    await fs.ensureDir(videoDir);
    contextOptions.recordVideo = { dir: videoDir, size: { width: 1280, height: 800 } };
  }

  const context: BrowserContext = await browser.newContext(contextOptions);
  const evidence: Evidence[] = [];
  let pages: PageResult[] = [];

  try {
    // ── Phase 1: Crawl ──────────────────────────────────────────────────────
    emit('Crawling pages…', 0, 0, 5);
    pages = await crawl(context, options.url, config, (scanned, discovered) => {
      const pct = 5 + Math.round((scanned / config.maxPages) * 35);
      emit(`Crawling… ${scanned}/${config.maxPages} pages`, scanned, discovered, pct);
    });

    emit('Capturing page evidence…', pages.length, pages.length, 42);

    // ── Phase 2: Evidence screenshots ──────────────────────────────────────
    const formPages = pages.filter((p) => p.hasForm).slice(0, 8);
    for (const pg of formPages) {
      const p = await context.newPage();
      try {
        await p.goto(pg.url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
        await p.waitForTimeout(800);
        const ev = await captureScreenshot(p, pg.url, outputDir, `Form page: ${pg.title || pg.url}`);
        evidence.push(ev);
      } catch { /* skip */ }
      finally { await p.close().catch(() => {}); }
    }

    // Landing page screenshot
    if (pages.length > 0) {
      const lp = await context.newPage();
      try {
        await lp.goto(options.url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
        await lp.waitForTimeout(1000);
        const ev = await captureScreenshot(lp, options.url, outputDir, 'Landing page overview');
        evidence.push(ev);
      } catch { /* skip */ }
      finally { await lp.close().catch(() => {}); }
    }

    emit('Analysing dimensions…', pages.length, pages.length, 55);

    // ── Phase 3: Dimension analysis ────────────────────────────────────────
    const genderAnalysis = analyzeGender(pages);
    const nationalityAnalysis = analyzeNationality(pages);
    const countryAnalysis = analyzeCountry(pages);
    const civilStatusAnalysis = analyzeCivilStatus(pages);
    const ageAnalysis = analyzeAge(pages);
    const legalDocAnalysis = analyzeLegalDocument(pages);

    emit('Probing email fields…', pages.length, pages.length, 65);
    const eaiAnalysis = await analyzeEAI(context, pages);

    emit('Analysing visual diversity…', pages.length, pages.length, 75);
    const raceAnalysis = await analyzeRaceEthnicity(pages, async (url) => {
      try {
        const p = await context.newPage();
        await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
        return p;
      } catch { return null; }
    });

    emit('Running language analysis…', pages.length, pages.length, 82);
    const _langAnalysis = analyzeLanguage(pages); // enriches issues

    // ── Phase 3b: Retail EU Risk Score ────────────────────────────────────
    emit('Running Retail EU risk engine…', pages.length, pages.length, 85);
    const retailSnapshot = buildRetailSnapshot(options.url, pages);
    const retailEngine   = new RetailRuleEngine();
    const retailRiskScore = retailEngine.evaluate(retailSnapshot);

    emit('Building findings…', pages.length, pages.length, 88);

    // ── Phase 4: Build findings ────────────────────────────────────────────
    const findings = [
      buildGenderFinding(genderAnalysis, evidence),
      buildEAIFinding(eaiAnalysis, evidence),
      buildNationalityFinding(nationalityAnalysis, evidence),
      buildCountryFinding(countryAnalysis, evidence),
      buildCivilStatusFinding(civilStatusAnalysis, evidence),
      buildAgeFinding(ageAnalysis, evidence),
      buildRaceEthnicityFinding(raceAnalysis, evidence),
      buildLegalDocFinding(legalDocAnalysis, evidence),
    ];

    // ── Phase 5: Scoring ───────────────────────────────────────────────────
    const statusScores: Record<string, number> = {
      'Complies': 100,
      'Partially Complies': 60,
      'Does Not Comply': 0,
      'Not Requested': 75,
      'Mixed / Multi-flow': 50,
    };
    const overallScore = Math.round(
      findings.reduce((acc, f) => acc + (statusScores[f.status] ?? 50), 0) / findings.length
    );

    const complies = findings.filter((f) => f.status === 'Complies' || f.status === 'Not Requested').length;
    const executiveSummary =
      `Scan of ${options.url} analysed ${pages.length} page(s) across 8 inclusivity dimensions. ` +
      `Overall inclusivity score: ${overallScore}/100. ` +
      `${complies} dimension(s) comply; ${findings.length - complies} require attention. ` +
      `Key concerns: ${findings
        .filter((f) => f.status === 'Does Not Comply' || f.status === 'Partially Complies')
        .map((f) => f.dimensionLabel)
        .join(', ') || 'none detected'}.`;

    emit('Saving run data…', pages.length, pages.length, 95);

    const run: ScanRun = {
      runId,
      options,
      status: 'completed',
      startedAt,
      completedAt: new Date().toISOString(),
      pagesScanned: pages.map((p) => p.url),
      findings,
      evidence,
      executiveSummary,
      overallScore,
      retailRiskScore: retailRiskScore as unknown as Record<string, unknown>,
    };

    await fs.writeJson(path.join(outputDir, 'report.json'), run, { spaces: 2 });

    emit('Scan complete.', pages.length, pages.length, 100);

    return run;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const failedRun: ScanRun = {
      runId,
      options,
      status: 'failed',
      startedAt,
      completedAt: new Date().toISOString(),
      pagesScanned: pages.map((p) => p.url),
      findings: [],
      evidence,
      executiveSummary: `Scan failed: ${errorMessage}`,
      overallScore: 0,
      errorMessage,
    };
    await fs.writeJson(path.join(outputDir, 'report.json'), failedRun, { spaces: 2 }).catch(() => {});
    throw error;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}
