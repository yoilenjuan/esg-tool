import * as cheerio from 'cheerio';
import { PageResult } from '../crawler';

export interface FormFieldAnalysis {
  /** Select/option field values for gender */
  genderOptions: string[];
  /** Whether a binary-only gender selector was found */
  binaryGenderOnly: boolean;
  /** Whether inclusive/neutral pronouns were offered */
  hasNeutralOption: boolean;
  /** Whether gendered titles (Sr./Sra., Mr./Ms.) are present */
  genderedTitlesFound: string[];
  /** Pages with gender issues */
  affectedUrls: string[];
}

const GENDERED_TITLE_RE = /\b(sr\.?|sra\.?|señor|señora|mr\.?|mrs\.?|ms\.?|don|doña)\b/gi;
const INCLUSIVE_OPTION_RE = /no.?binari|non.?binary|otro|other|prefer.?not|x|nb|they|elle|@|neutral|diverso/i;
const BINARY_VALUES = new Set([
  'male', 'female', 'hombre', 'mujer', 'masculino', 'femenino',
  'm', 'f', 'h', 'v',
]);

export function analyzeGender(pages: PageResult[]): FormFieldAnalysis {
  const result: FormFieldAnalysis = {
    genderOptions: [],
    binaryGenderOnly: false,
    hasNeutralOption: false,
    genderedTitlesFound: [],
    affectedUrls: [],
  };

  for (const page of pages) {
    const $ = cheerio.load(page.html);
    let pageAffected = false;

    // Detect gender selects
    $('select').each((_, sel) => {
      const name = ($(sel).attr('name') || $(sel).attr('id') || '').toLowerCase();
      if (!/genero|gender|sexo|sex|titulo|title|salutation|tratamiento/.test(name)) return;

      const opts: string[] = [];
      $(sel).find('option').each((_, opt) => {
        const val = ($(opt).val() as string || $(opt).text()).trim().toLowerCase();
        if (val && val !== '') opts.push(val);
      });

      if (opts.length > 0) {
        result.genderOptions.push(...opts);
        const hasNeutral = opts.some((o) => INCLUSIVE_OPTION_RE.test(o));
        if (hasNeutral) result.hasNeutralOption = true;

        const allBinary = opts
          .filter((o) => o !== '' && !/selecciona|select|choose|elige/.test(o))
          .every((o) => BINARY_VALUES.has(o));
        if (allBinary && opts.length > 0 && !hasNeutral) result.binaryGenderOnly = true;
        pageAffected = true;
      }
    });

    // Detect gendered titles in labels, text
    const bodyText = $.text();
    const titleMatches = bodyText.match(GENDERED_TITLE_RE) || [];
    if (titleMatches.length > 0) {
      result.genderedTitlesFound.push(
        ...titleMatches.map((t) => `${t} (${page.url})`)
      );
      pageAffected = true;
    }

    if (pageAffected) result.affectedUrls.push(page.url);
  }

  // Deduplicate
  result.genderOptions = [...new Set(result.genderOptions)];
  result.genderedTitlesFound = [...new Set(result.genderedTitlesFound)];
  result.affectedUrls = [...new Set(result.affectedUrls)];

  return result;
}
