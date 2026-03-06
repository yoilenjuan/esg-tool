import * as cheerio from 'cheerio';
import { PageResult } from '../crawler';

export interface NationalityAnalysis {
  fieldPresent: boolean;
  usesClosedList: boolean;
  hasSelfDescription: boolean;
  optionCount: number;
  sampleOptions: string[];
  affectedUrls: string[];
}

export function analyzeNationality(pages: PageResult[]): NationalityAnalysis {
  const result: NationalityAnalysis = {
    fieldPresent: false,
    usesClosedList: false,
    hasSelfDescription: false,
    optionCount: 0,
    sampleOptions: [],
    affectedUrls: [],
  };

  for (const page of pages) {
    const $ = cheerio.load(page.html);

    $('select, input[list]').each((_, el) => {
      const name = ($(el).attr('name') || $(el).attr('id') || $(el).attr('placeholder') || '').toLowerCase();
      if (!/naciona|nationalit|pais.?origen|country.?origin/.test(name)) return;

      result.fieldPresent = true;
      result.affectedUrls.push(page.url);

      if (el.tagName === 'select') {
        result.usesClosedList = true;
        const opts: string[] = [];
        $(el).find('option').each((_, opt) => {
          opts.push(($(opt).text() || '').trim());
        });
        result.optionCount = Math.max(result.optionCount, opts.length);
        result.sampleOptions.push(...opts.slice(0, 5));

        const hasFreeText = opts.some((o) => /otro|other|prefer|ninguna|specify/i.test(o));
        if (hasFreeText) result.hasSelfDescription = true;
      }

      // text/datalist input allows free description
      if (el.tagName === 'input') {
        result.hasSelfDescription = true;
      }
    });
  }

  result.sampleOptions = [...new Set(result.sampleOptions)].slice(0, 10);
  result.affectedUrls = [...new Set(result.affectedUrls)];
  return result;
}
