import { Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';
import { Evidence } from '@esg/shared';

export async function captureScreenshot(
  page: Page,
  pageUrl: string,
  outputDir: string,
  description: string
): Promise<Evidence> {
  const id = uuidv4();
  const filename = `screenshot_${id}.png`;
  const screenshotDir = path.join(outputDir, 'screenshots');
  await fs.ensureDir(screenshotDir);
  const filePath = path.join(screenshotDir, filename);

  await page.screenshot({ path: filePath, fullPage: true, type: 'png' });

  return {
    id,
    type: 'screenshot',
    filePath: path.join('screenshots', filename),
    pageUrl,
    description,
    capturedAt: new Date().toISOString(),
  };
}

export async function captureElementScreenshot(
  page: Page,
  selector: string,
  pageUrl: string,
  outputDir: string,
  description: string
): Promise<Evidence | null> {
  try {
    const el = await page.$(selector);
    if (!el) return null;

    const id = uuidv4();
    const filename = `screenshot_${id}.png`;
    const screenshotDir = path.join(outputDir, 'screenshots');
    await fs.ensureDir(screenshotDir);
    const filePath = path.join(screenshotDir, filename);

    await el.screenshot({ path: filePath, type: 'png' });

    return {
      id,
      type: 'screenshot',
      filePath: path.join('screenshots', filename),
      pageUrl,
      description,
      capturedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function buildVideoEvidence(
  videoPath: string,
  pageUrl: string,
  outputDir: string
): Evidence {
  const relativePath = path.relative(outputDir, videoPath);
  return {
    id: uuidv4(),
    type: 'video',
    filePath: relativePath,
    pageUrl,
    description: 'Screen recording of the scan session',
    capturedAt: new Date().toISOString(),
  };
}
