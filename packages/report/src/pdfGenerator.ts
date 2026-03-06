import * as path from 'path';
import * as fs from 'fs-extra';
import { chromium } from 'playwright';
import { ScanRun } from '@esg/shared';
import { buildHtmlReport } from './htmlTemplate';

export async function generatePdf(run: ScanRun, outputDir: string): Promise<string> {
  const htmlContent = buildHtmlReport(run);
  const htmlPath = path.join(outputDir, 'report.html');
  const pdfPath = path.join(outputDir, 'report.pdf');

  await fs.writeFile(htmlPath, htmlContent, 'utf-8');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.setContent(htmlContent, { waitUntil: 'networkidle' });
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
      printBackground: true,
    });
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }

  return pdfPath;
}

export { buildHtmlReport };
