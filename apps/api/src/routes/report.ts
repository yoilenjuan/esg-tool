import { Router, Request, Response, IRouter } from 'express';
import * as path from 'path';
import * as fs from 'fs-extra';
import { chromium } from 'playwright';
import { regenerateReport, buildHtml } from '../report/pdf';
import { ScanRunResult } from '../types/run';

export function reportRouter(runsBaseDir: string): IRouter {
  const router = Router();

  /**
   * GET /api/report/:runId
   * Returns the full scan run result as JSON.
   */
  router.get('/:runId', async (req: Request, res: Response) => {
    const { runId } = req.params;
    const runDir = path.join(runsBaseDir, runId);
    const reportPath = path.join(runDir, 'report.json');

    if (!await fs.pathExists(reportPath)) {
      return res.status(404).json({ error: `Report for run ${runId} not found` });
    }

    const run = await fs.readJson(reportPath) as ScanRunResult;
    res.json({ run });
  });

  /**
   * GET /api/report/:runId/pdf  (also /api/runs/:runId/pdf when mounted there)
   * Generates (or returns cached) PDF for the run.
   */
  router.get('/:runId/pdf', async (req: Request, res: Response) => {
    const { runId } = req.params;
    const runDir = path.join(runsBaseDir, runId);
    const reportPath = path.join(runDir, 'report.json');
    const pdfPath = path.join(runDir, 'report.pdf');

    if (!await fs.pathExists(reportPath)) {
      return res.status(404).json({ error: `Report for run ${runId} not found` });
    }

    if (!await fs.pathExists(pdfPath)) {
      const browser = await chromium.launch();
      try {
        await regenerateReport(runDir, browser);
      } finally {
        await browser.close().catch(() => {});
      }
    }

    res.download(pdfPath, `esg-report-${runId}.pdf`);
  });

  /**
   * GET /api/runs/:runId/report  (PDF download — primary new endpoint)
   * Always regenerates the PDF so it reflects the latest report.json.
   */
  router.get('/:runId/report', async (req: Request, res: Response) => {
    const { runId } = req.params;
    const runDir = path.join(runsBaseDir, runId);
    const reportPath = path.join(runDir, 'report.json');

    if (!await fs.pathExists(reportPath)) {
      return res.status(404).json({ error: `Report for run ${runId} not found` });
    }

    const browser = await chromium.launch();
    try {
      const { pdfPath } = await regenerateReport(runDir, browser);
      res.download(pdfPath, `esg-report-${runId}.pdf`);
    } catch (err) {
      await browser.close().catch(() => {});
      throw err;
    }
    await browser.close().catch(() => {});
  });

  /**
   * GET /api/report/:runId/html
   * Returns the raw HTML report (for preview).
   */
  router.get('/:runId/html', async (req: Request, res: Response) => {
    const { runId } = req.params;
    const runDir = path.join(runsBaseDir, runId);
    const htmlPath = path.join(runDir, 'report.html');
    const reportPath = path.join(runDir, 'report.json');

    if (!await fs.pathExists(reportPath)) {
      return res.status(404).json({ error: `Report for run ${runId} not found` });
    }

    if (!await fs.pathExists(htmlPath)) {
      const run = await fs.readJson(reportPath) as ScanRunResult;
      const html = buildHtml(run);
      await fs.writeFile(htmlPath, html, 'utf-8');
    }

    res.setHeader('Content-Type', 'text/html');
    const html = await fs.readFile(htmlPath, 'utf-8');
    res.send(html);
  });

  return router;
}
