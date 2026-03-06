import * as cheerio from 'cheerio';
import { PageResult } from '../crawler';

// A representative set of countries that are often missing from small selectors
const KEY_COUNTRIES = [
  'afghanistan', 'albania', 'algeria', 'argentina', 'armenia', 'azerbaijan',
  'bangladesh', 'belarus', 'bolivia', 'bosnia', 'brazil',
  'cambodia', 'cameroon', 'chile', 'china', 'colombia', 'congo', 'cuba',
  'djibouti', 'dominican republic',
  'ecuador', 'egypt', 'eritrea', 'ethiopia',
  'gambia', 'georgia', 'ghana', 'guatemala', 'guinea',
  'haiti', 'honduras',
  'india', 'indonesia', 'iran', 'iraq',
  'jamaica', 'jordan',
  'kazakhstan', 'kenya', 'kuwait', 'kyrgyzstan',
  'laos', 'lebanon', 'libya',
  'madagascar', 'malaysia', 'mali', 'mauritania', 'mexico', 'moldova', 'mongolia', 'morocco', 'mozambique', 'myanmar',
  'nepal', 'nicaragua', 'niger', 'nigeria',
  'oman',
  'pakistan', 'palestine', 'panama', 'paraguay', 'peru', 'philippines',
  'qatar',
  'russia', 'rwanda',
  'saudi arabia', 'senegal', 'somalia', 'south africa', 'south sudan', 'sri lanka', 'sudan', 'syria',
  'tajikistan', 'tanzania', 'thailand', 'timor-leste', 'togo', 'tunisia', 'turkmenistan',
  'uganda', 'ukraine', 'uruguay', 'uzbekistan',
  'venezuela', 'vietnam',
  'yemen',
  'zambia', 'zimbabwe',
];

export interface CountryAnalysis {
  fieldPresent: boolean;
  optionCount: number;
  coverageRating: 'comprehensive' | 'partial' | 'limited';
  missingKeyCoverage: boolean;
  defaultsToOneCountry: boolean;
  detectedDefaultCountry: string | null;
  affectedUrls: string[];
}

export function analyzeCountry(pages: PageResult[]): CountryAnalysis {
  const result: CountryAnalysis = {
    fieldPresent: false,
    optionCount: 0,
    coverageRating: 'limited',
    missingKeyCoverage: false,
    defaultsToOneCountry: false,
    detectedDefaultCountry: null,
    affectedUrls: [],
  };

  for (const page of pages) {
    const $ = cheerio.load(page.html);

    $('select').each((_, sel) => {
      const name = ($(sel).attr('name') || $(sel).attr('id') || '').toLowerCase();
      if (!/pais|country|countr/.test(name)) return;

      result.fieldPresent = true;
      result.affectedUrls.push(page.url);

      const opts: string[] = [];
      $(sel).find('option').each((_, opt) => {
        opts.push(($(opt).text() || '').trim().toLowerCase());
      });

      result.optionCount = Math.max(result.optionCount, opts.length);

      // Coverage
      const matched = KEY_COUNTRIES.filter((kc) => opts.some((o) => o.includes(kc)));
      const coverage = matched.length / KEY_COUNTRIES.length;
      if (coverage > 0.85) result.coverageRating = 'comprehensive';
      else if (coverage > 0.5) result.coverageRating = 'partial';
      else {
        result.coverageRating = 'limited';
        result.missingKeyCoverage = true;
      }

      // Check if a single country is pre-selected/forced
      const selected = $(sel).find('option[selected]');
      if (selected.length === 1 && opts.filter((o) => o.length > 0 && !/selecciona|choose/.test(o)).length <= 3) {
        result.defaultsToOneCountry = true;
        result.detectedDefaultCountry = (selected.text() || '').trim();
      }
    });
  }

  result.affectedUrls = [...new Set(result.affectedUrls)];
  return result;
}
