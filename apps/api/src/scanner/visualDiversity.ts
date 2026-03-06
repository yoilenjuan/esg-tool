/**
 * Visual diversity analyser.
 * Examines hero / landing page images for diversity signals using alt-text
 * vocabulary heuristics only (no image classification AI).
 *
 * IMPORTANT DISCLAIMER: This module never identifies real individuals from
 * images. All analysis is based solely on publicly available text metadata
 * (alt attributes, figure captions, aria-labels).
 */
import type { BrowserContext } from 'playwright';
import type { CrawledPage, VisualDiversityAnalysis, DiversityRating } from '../types/run';

const DISCLAIMER =
  'This assessment is based solely on image alt-text and visible caption metadata. ' +
  'It does not identify, classify, or make assumptions about real individuals. ' +
  'The findings are indicative and should be reviewed by a qualified equity expert.';

// ─── Alt-text vocabulary signals ─────────────────────────────────────────────
const INCLUSIVE_SIGNALS: RegExp[] = [
  /diverse|diversity|inclusiv/i,
  /multiracial|multicultural|multi-cultural/i,
  /disability|wheelchair|accessible/i,
  /discapacidad|silla de ruedas|accesible/i,
  /afro|black|brown|hispanic|latina[os]?|chin[oa]/i,
  /elderly|senior|older person|mayor|persona mayor/i,
  /lgbtq|pride|orgullo|gay|lesbian/i,
  /hijab|niqab|turban|turbante/i,
  /prosth/i,
  /non.?binary|non.?binario/i,
];

const EXCLUSION_SIGNALS: RegExp[] = [
  /\b(white|blanco|rubio|rubia|blond)\b/i, // monoculture indicator only when few images
];

interface ImageInfo {
  alt: string;
  width: number;
  height: number;
  src: string;
  figCaption: string;
  ariaLabel: string;
}

async function extractImages(
  ctx: BrowserContext,
  pageUrl: string,
): Promise<ImageInfo[]> {
  const page = await ctx.newPage();
  try {
    await page.goto(pageUrl, { timeout: 20_000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    return page.evaluate(() => {
      const imgs: ImageInfo[] = [];
      document.querySelectorAll('img').forEach((img) => {
        const rect = img.getBoundingClientRect();
        const w = img.naturalWidth || rect.width;
        const h = img.naturalHeight || rect.height;

        // Only large images (likely editorial/hero content, not icons)
        if (w < 200 || h < 150) return;

        // Caption from figure parent
        const fig = img.closest('figure');
        const cap = fig?.querySelector('figcaption')?.textContent?.trim() ?? '';

        imgs.push({
          alt: img.alt?.trim() ?? '',
          width: w,
          height: h,
          src: img.src,
          figCaption: cap,
          ariaLabel: img.getAttribute('aria-label') ?? '',
        });
      });
      return imgs;
    }) as Promise<ImageInfo[]>;
  } finally {
    await page.close().catch(() => {});
  }
}

function scoreImages(images: ImageInfo[]): {
  rating: DiversityRating;
  observation: string;
} {
  if (images.length === 0) {
    return { rating: 'Unknown', observation: 'No large images found on the analysed pages.' };
  }

  let inclusiveCount = 0;
  let exclusionCount = 0;

  for (const img of images) {
    const haystack = [img.alt, img.figCaption, img.ariaLabel].join(' ');
    if (!haystack.trim()) continue;

    if (INCLUSIVE_SIGNALS.some((r) => r.test(haystack))) inclusiveCount++;
    if (EXCLUSION_SIGNALS.some((r) => r.test(haystack))) exclusionCount++;
  }

  const total = images.length;
  const inclusiveRatio = total > 0 ? inclusiveCount / total : 0;

  let rating: DiversityRating;
  let observation: string;

  if (total === 0) {
    rating = 'Unknown';
    observation = 'No large images detected. Diversity of visual representation could not be assessed.';
  } else if (inclusiveRatio >= 0.4) {
    rating = 'Diverse';
    observation = `Alt-text and captions across ${total} large image(s) include vocabulary associated with representation of varied groups. This is a positive signal.`;
  } else if (inclusiveRatio >= 0.15 || (inclusiveCount >= 1 && total <= 5)) {
    rating = 'Moderate';
    observation = `Some inclusion-positive language found in image metadata across ${total} image(s). Representation appears present but not prominent.`;
  } else if (exclusionCount > 0 && inclusiveCount === 0) {
    rating = 'Limited';
    observation = `Image alt-text across ${total} image(s) does not contain vocabulary associated with diversity. This may indicate a monolithic visual identity.`;
  } else {
    rating = 'Unknown';
    observation = `Image alt-text across ${total} image(s) is absent or uninformative. Diversity of representation cannot be assessed from metadata alone. A manual visual audit is recommended.`;
  }

  return { rating, observation };
}

// ─── Main analyser ────────────────────────────────────────────────────────────
export async function analyseVisualDiversity(
  ctx: BrowserContext,
  pages: CrawledPage[],
): Promise<VisualDiversityAnalysis> {
  // Only analyse home and marketing pages (hero imagery focus)
  const targetPages = pages.filter((p) =>
    p.category === 'home' || p.category === 'marketing' || p.category === 'product',
  ).slice(0, 3);

  if (targetPages.length === 0) {
    return {
      rating: 'Unknown',
      largeImagesFound: 0,
      observationNote: 'No home or marketing pages were available for visual diversity analysis.',
      disclaimer: DISCLAIMER,
      pagesAnalysed: [],
    };
  }

  const allImages: ImageInfo[] = [];
  const pagesAnalysed: string[] = [];

  for (const page of targetPages) {
    try {
      const imgs = await extractImages(ctx, page.url);
      allImages.push(...imgs);
      pagesAnalysed.push(page.url);
    } catch {
      // Skip on error
    }
  }

  const { rating, observation } = scoreImages(allImages);

  return {
    rating,
    largeImagesFound: allImages.length,
    observationNote: observation,
    disclaimer: DISCLAIMER,
    pagesAnalysed,
  };
}
