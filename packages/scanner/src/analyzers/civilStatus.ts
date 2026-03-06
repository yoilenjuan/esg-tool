import * as cheerio from 'cheerio';
import { PageResult } from '../crawler';

export interface CivilStatusAnalysis {
  fieldPresent: boolean;
  options: string[];
  includesNonHeteronormative: boolean;
  binaryHonorificsOnly: boolean;
  affectedUrls: string[];
}

const NON_HETERO_RE = /pareja.?hecho|union.?libre|uni[oó]n.?civil|dom[eé]stic.?partner|cohabiting|same.?sex|igualitari/i;
const HETERO_ONLY = ['soltero', 'casado', 'divorciado', 'viudo', 'single', 'married', 'divorced', 'widowed'];

export function analyzeCivilStatus(pages: PageResult[]): CivilStatusAnalysis {
  const result: CivilStatusAnalysis = {
    fieldPresent: false,
    options: [],
    includesNonHeteronormative: false,
    binaryHonorificsOnly: true,
    affectedUrls: [],
  };

  for (const page of pages) {
    const $ = cheerio.load(page.html);

    $('select').each((_, sel) => {
      const attr = ($(sel).attr('name') || $(sel).attr('id') || '').toLowerCase();
      if (!/estado.?civil|civil.?status|marital|estado_civil/.test(attr)) return;

      result.fieldPresent = true;
      result.affectedUrls.push(page.url);

      const opts: string[] = [];
      $(sel).find('option').each((_, opt) => {
        opts.push(($(opt).text() || '').trim());
      });
      result.options.push(...opts);

      const joined = opts.join(' ').toLowerCase();
      if (NON_HETERO_RE.test(joined)) result.includesNonHeteronormative = true;

      const allHeteroNorm = opts
        .filter((o) => o.trim() && !/selecciona|choose/.test(o.toLowerCase()))
        .every((o) => HETERO_ONLY.some((h) => o.toLowerCase().includes(h)));
      if (!allHeteroNorm) result.binaryHonorificsOnly = false;
    });
  }

  result.options = [...new Set(result.options)];
  result.affectedUrls = [...new Set(result.affectedUrls)];
  return result;
}
