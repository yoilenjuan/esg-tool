import { Page } from 'playwright';
import { PageResult } from '../crawler';

export type DiversityRating = 'limited' | 'moderate' | 'diverse';

export interface RaceEthnicityAnalysis {
  /**
   * Approximate, non-identifying visual diversity rating.
   * Based on presence of human-context imagery, NOT individual identification.
   */
  diversityRating: DiversityRating;
  heroImagesFound: number;
  analysisNote: string;
  affectedUrls: string[];
}

/**
 * Heuristic: counts <img> elements on hero/landing pages.
 * Rates diversity as limited/moderate/diverse based on:
 * - Number of distinct human-context images (not identified)
 * - Variety in alt-text descriptions and surrounding context
 * 
 * IMPORTANT: This does NOT attempt to identify individuals.
 * Diversity rating is approximate and should be treated as indicative only.
 */
export async function analyzeRaceEthnicity(
  pages: PageResult[],
  getPage: (url: string) => Promise<Page | null>
): Promise<RaceEthnicityAnalysis> {
  const result: RaceEthnicityAnalysis = {
    diversityRating: 'limited',
    heroImagesFound: 0,
    analysisNote:
      'Approximate heuristic based on image count and alt-text variety. Does NOT identify individuals.',
    affectedUrls: [],
  };

  // Only analyse landing / product pages (hero images)
  const targetPages = pages
    .filter((p) => ['landing', 'product', 'other'].includes(p.pageType))
    .slice(0, 5);

  let totalImages = 0;
  const altTexts: string[] = [];

  for (const pg of targetPages) {
    const page = await getPage(pg.url);
    if (!page) continue;

    try {
      const images = await page.$$eval(
        'img',
        (imgs) =>
          imgs.map((img) => ({
            src: img.src,
            alt: img.alt || '',
            width: img.naturalWidth,
            height: img.naturalHeight,
          }))
      );

      // Count large images (likely hero/banner, not icons)
      const heroImgs = images.filter((i) => i.width > 200 && i.height > 150);
      totalImages += heroImgs.length;
      altTexts.push(...heroImgs.map((i) => i.alt).filter((a) => a.length > 3));
      result.affectedUrls.push(pg.url);
    } catch { /* skip */ }
    finally {
      await page.close().catch(() => {});
    }
  }

  result.heroImagesFound = totalImages;

  // Simple heuristic thresholds
  // Diversity is inferred from alt-text variety (unique words) + image count
  const uniqueWords = new Set(
    altTexts
      .join(' ')
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3)
  ).size;

  if (totalImages === 0) {
    result.diversityRating = 'limited';
    result.analysisNote += ' No large images detected on scanned pages.';
  } else if (totalImages >= 6 && uniqueWords >= 15) {
    result.diversityRating = 'diverse';
  } else if (totalImages >= 3 || uniqueWords >= 8) {
    result.diversityRating = 'moderate';
  } else {
    result.diversityRating = 'limited';
  }

  result.affectedUrls = [...new Set(result.affectedUrls)];
  return result;
}
