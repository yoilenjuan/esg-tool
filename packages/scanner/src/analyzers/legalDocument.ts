import * as cheerio from 'cheerio';
import { PageResult } from '../crawler';

export interface LegalDocumentAnalysis {
  fieldPresent: boolean;
  acceptedTypes: string[];
  /** Whether only country-specific docs are accepted (e.g., DNI only → excludes foreigners) */
  nationalOnlyRisk: boolean;
  /** Whether passport is accepted (international inclusive) */
  passportAccepted: boolean;
  /** Whether NIE or equivalent foreign-resident doc is accepted */
  foreignResidentAccepted: boolean;
  affectedUrls: string[];
}

const DOC_FIELD_RE = /documento|doc.?type|tipo.?doc|dni|nie|passport|n[uú]mero.?id|id.?number|identification/i;
const DNI_RE = /\bdni\b/i;
const NIE_RE = /\bnie\b/i;
const PASSPORT_RE = /passport|pasaporte/i;
const FOREIGN_RE = /nie|n[uú]mero.?extranjero|foreign|residence.?permit|permiso.?residencia/i;

export function analyzeLegalDocument(pages: PageResult[]): LegalDocumentAnalysis {
  const result: LegalDocumentAnalysis = {
    fieldPresent: false,
    acceptedTypes: [],
    nationalOnlyRisk: false,
    passportAccepted: false,
    foreignResidentAccepted: false,
    affectedUrls: [],
  };

  for (const page of pages) {
    const $ = cheerio.load(page.html);

    $('select, input').each((_, el) => {
      const attrs = [
        $(el).attr('name') || '',
        $(el).attr('id') || '',
        $(el).attr('placeholder') || '',
        $(el).attr('aria-label') || '',
      ].join(' ');

      if (!DOC_FIELD_RE.test(attrs)) return;

      result.fieldPresent = true;
      result.affectedUrls.push(page.url);

      if (el.tagName === 'select') {
        const opts: string[] = [];
        $(el).find('option').each((_, opt) => {
          opts.push(($(opt).text() || '').trim());
        });
        result.acceptedTypes.push(...opts);

        const joined = opts.join(' ');
        if (PASSPORT_RE.test(joined)) result.passportAccepted = true;
        if (FOREIGN_RE.test(joined)) result.foreignResidentAccepted = true;
        if (DNI_RE.test(joined) && !PASSPORT_RE.test(joined) && !NIE_RE.test(joined)) {
          result.nationalOnlyRisk = true;
        }
      }

      // Free-text input – check surrounding label for hints
      const id = $(el).attr('id') || '';
      const label = $(`label[for="${id}"]`).text() || '';
      if (PASSPORT_RE.test(label)) result.passportAccepted = true;
      if (FOREIGN_RE.test(label)) result.foreignResidentAccepted = true;
    });
  }

  result.acceptedTypes = [...new Set(result.acceptedTypes)].filter((t) => t.trim().length > 0);
  result.affectedUrls = [...new Set(result.affectedUrls)];
  return result;
}
