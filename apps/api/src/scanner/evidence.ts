/**
 * Evidence capture helpers — screenshots and video evidence records.
 */
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type { Page } from 'playwright';
import type { EvidenceRecord } from '../types/run';

/**
 * Capture a full-page screenshot and return an EvidenceRecord.
 * File is saved to {screenshotsDir}/ev-{uuid}.png
 */
export async function captureScreenshot(
  page: Page,
  description: string,
  screenshotsDir: string,
  pageUrl: string,
  dimensionTags: string[] = [],
): Promise<EvidenceRecord> {
  fs.mkdirSync(screenshotsDir, { recursive: true });

  const id = `ev-${randomUUID()}`;
  const fileName = `${id}.png`;
  const absPath = path.join(screenshotsDir, fileName);
  const relPath = path.join('screenshots', fileName);

  await page.screenshot({ path: absPath, fullPage: true });

  return {
    id,
    type: 'screenshot',
    filePath: relPath,
    pageUrl,
    description,
    capturedAt: new Date().toISOString(),
    dimensionTags,
  };
}

/**
 * Build a video EvidenceRecord from a recorded context video path.
 * Playwright saves the video after context.close(); call this afterwards.
 */
export async function buildVideoEvidence(
  videoPath: string,
  pageUrl: string,
  videosDir: string,
  dimensionTags: string[] = [],
): Promise<EvidenceRecord | null> {
  if (!videoPath || !fs.existsSync(videoPath)) return null;

  fs.mkdirSync(videosDir, { recursive: true });

  const id = `ev-${randomUUID()}`;
  const fileName = `${id}.webm`;
  const destAbs = path.join(videosDir, fileName);

  fs.renameSync(videoPath, destAbs);

  return {
    id,
    type: 'video',
    filePath: path.join('videos', fileName),
    pageUrl,
    description: 'Session recording',
    capturedAt: new Date().toISOString(),
    dimensionTags,
  };
}

/**
 * Sanitise a URL into a short string safe for filenames.
 */
export function urlToFileStem(url: string): string {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9_\-]/gi, '_')
    .slice(0, 60);
}
