import * as cheerio from 'cheerio';
import { PageResult } from '../crawler';

export interface AgeAnalysis {
  dobRequired: boolean;
  ageGateDetected: boolean;
  stereotypedSegmentation: boolean;
  stereotypedPhrases: string[];
  affectedUrls: string[];
}

const AGE_GATE_RE = /debes.?tener|you.?must.?be|are.?you.?over|mayor.?de.?18|over.?18|legal.?age/i;
const STEREOTYPE_RE = /joven|senior|mayor|adult[ao]|millennial|gen.?z|boomer|tercera.?edad|for.?(kids?|children|teens?|elderly|old|young)/i;

export function analyzeAge(pages: PageResult[]): AgeAnalysis {
  const result: AgeAnalysis = {
    dobRequired: false,
    ageGateDetected: false,
    stereotypedSegmentation: false,
    stereotypedPhrases: [],
    affectedUrls: [],
  };

  for (const page of pages) {
    const $ = cheerio.load(page.html);
    let pageAffected = false;

    // DOB fields
    $('input').each((_, inp) => {
      const attr = [
        $(inp).attr('name') || '',
        $(inp).attr('id') || '',
        $(inp).attr('placeholder') || '',
        $(inp).attr('type') || '',
      ].join(' ').toLowerCase();

      if (/fecha.?nacimiento|birth.?date|dob|date.?of.?birth|f_nac/.test(attr)) {
        const required =
          $(inp).attr('required') !== undefined ||
          $(inp).attr('aria-required') === 'true';
        if (required) {
          result.dobRequired = true;
          pageAffected = true;
        }
      }
    });

    // Age gate
    const bodyText = $.text();
    if (AGE_GATE_RE.test(bodyText)) {
      result.ageGateDetected = true;
      pageAffected = true;
    }

    // Stereotyped segmentation in copy
    const matches = bodyText.match(STEREOTYPE_RE);
    if (matches) {
      result.stereotypedSegmentation = true;
      result.stereotypedPhrases.push(...matches.map((m) => `"${m}" on ${page.url}`));
      pageAffected = true;
    }

    if (pageAffected) result.affectedUrls.push(page.url);
  }

  result.stereotypedPhrases = [...new Set(result.stereotypedPhrases)].slice(0, 10);
  result.affectedUrls = [...new Set(result.affectedUrls)];
  return result;
}
