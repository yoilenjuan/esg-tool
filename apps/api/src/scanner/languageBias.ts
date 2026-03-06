/**
 * Language bias analyser.
 * Runs a custom rule engine against every page's visible text and optionally
 * calls a self-hosted LanguageTool server for deeper style/bias checks.
 */
import type { CrawledPage, LanguageBiasAnalysis, LanguageIssue } from '../types/run';

// ─── Custom bias rules (Spanish-first, covers region-neutral retail) ──────────
interface CustomRule {
  id: string;
  description: string;
  pattern: RegExp;
  suggestion: string;
}

const CUSTOM_RULES: CustomRule[] = [
  // Gendered titles
  {
    id: 'ESG_GENDER_TITLE_SR',
    description: 'Gendered salutation (Sr./Sra.) excludes non-binary customers',
    pattern: /\b(Sr\.|Sra\.|señor|señora|señorita)\b/gi,
    suggestion: 'Replace with "Cliente", "Persona", or ask for preferred salutation at profile stage',
  },
  // Binary gender only (male/female)
  {
    id: 'ESG_GENDER_BINARY_SELECT',
    description: 'Binary-only gender options (Hombre/Mujer) exclude non-binary identities',
    pattern: /\b(hombre|mujer)\b[\s/|\\]+\b(mujer|hombre)\b/gi,
    suggestion: 'Add non-binary option and/or free-text "prefer to self-describe" field',
  },
  // Heteronormative assumptions
  {
    id: 'ESG_HETERONORMATIVE',
    description: 'Heteronormative copy assumes male-female couples',
    pattern: /\b(marido|esposo|esposa|mujer e hijos|madre y padre|padres e hijos)\b/gi,
    suggestion: 'Replace with "pareja", "persona a su cargo", "familia"',
  },
  // Ageist terms
  {
    id: 'ESG_AGEIST_TERM',
    description: 'Ageist phrasing',
    pattern: /\b(ancian[oa]s?|vejez|tercera edad|cuarto sector|adulto mayor)\b/gi,
    suggestion: 'Replace with "personas mayores" or "clientes de todas las edades"',
  },
  // Nationality bias: "extranjero" used pejoratively in commercial context
  {
    id: 'ESG_NATIONALITY_BIAS',
    description: '"Extranjero" in context of identity requirements may exclude foreign nationals',
    pattern: /\b(extranjero|extranjera)\b/gi,
    suggestion: 'Clarify policy applies to all customers; consider nationality-neutral phrasing',
  },
  // Nationality-only nationality field labels
  {
    id: 'ESG_NATIONALITY_SELECT_LABEL',
    description: 'Label "Nacionalidad" may be legally required but check GDPR necessity',
    pattern: /\bnacionalidad\b/gi,
    suggestion: 'Ensure GDPR legal basis is documented; do not use for marketing segmentation',
  },
  // Document exclusion: "required" DNI/NIF only blocks non-Spanish
  {
    id: 'ESG_DOCUMENT_SPANISH_ONLY',
    description: 'Spanish-only document types (DNI must be 8 digits) block foreign nationals',
    pattern: /\b(dni)\b.*\b(obligatorio|requerido|required)\b/gi,
    suggestion: 'Accept NIE, passport, and other EU document types as alternatives',
  },
  // Age gating without alternative
  {
    id: 'ESG_AGE_GATE_ONLY',
    description: 'Age gate without alternative identity verification excludes older customers with no ID',
    pattern: /\b(mayor[es]?\s+de\s+18|18\s+años|age\s*gate)\b/gi,
    suggestion: 'Provide alternative verification pathway for customers unable to supply digital ID',
  },
];

// ─── LanguageTool HTTP integration ────────────────────────────────────────────
interface LTMatch {
  message: string;
  shortMessage: string;
  replacements: Array<{ value: string }>;
  offset: number;
  length: number;
  sentence: string;
  rule: { id: string; description: string };
}

async function callLanguageTool(
  text: string,
  url: string,
  languageToolUrl: string,
): Promise<LanguageIssue[]> {
  const issues: LanguageIssue[] = [];
  try {
    const res = await fetch(`${languageToolUrl}/v2/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        text: text.slice(0, 30_000), // LanguageTool free limits
        language: 'es',
        enabledRules: 'GENDER_AGREEMENT,BIASED_LANGUAGE',
        enabledOnly: 'false',
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return issues;
    const json = (await res.json()) as { matches?: LTMatch[] };
    for (const m of json.matches ?? []) {
      const snippet = text.slice(m.offset, m.offset + m.length);
      const ctxStart = Math.max(0, m.offset - 40);
      const context = text.slice(ctxStart, m.offset + m.length + 40).replace(/\s+/g, ' ');
      issues.push({
        ruleId: m.rule.id,
        description: m.rule.description ?? m.shortMessage,
        match: snippet,
        context,
        suggestion: m.replacements[0]?.value ?? 'Review and rewrite',
        pageUrl: url,
        source: 'languagetool',
      });
    }
  } catch {
    // LanguageTool unavailable — return empty
  }
  return issues;
}

// ─── Probe a single page text ─────────────────────────────────────────────────
function applyCustomRules(text: string, pageUrl: string): LanguageIssue[] {
  const issues: LanguageIssue[] = [];
  for (const rule of CUSTOM_RULES) {
    rule.pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.pattern.exec(text)) !== null) {
      const start = Math.max(0, m.index - 40);
      const end = Math.min(text.length, m.index + m[0].length + 40);
      issues.push({
        ruleId: rule.id,
        description: rule.description,
        match: m[0],
        context: text.slice(start, end).replace(/\s+/g, ' '),
        suggestion: rule.suggestion,
        pageUrl,
        source: 'custom',
      });
      // Limit rules to 5 hits per page to avoid flooding
      if (issues.filter((i) => i.ruleId === rule.id && i.pageUrl === pageUrl).length >= 5) break;
    }
  }
  return issues;
}

// ─── Main analyser ────────────────────────────────────────────────────────────
export async function analyseLanguageBias(
  pages: CrawledPage[],
  languageToolUrl?: string,
): Promise<LanguageBiasAnalysis> {
  const allIssues: LanguageIssue[] = [];
  const pagesAnalysed: string[] = [];
  let ltAvailable = false;

  // Test LanguageTool availability
  if (languageToolUrl) {
    try {
      const r = await fetch(`${languageToolUrl}/v2/languages`, { signal: AbortSignal.timeout(3_000) });
      ltAvailable = r.ok;
    } catch {
      ltAvailable = false;
    }
  }

  // Analyse every page with visible text
  for (const page of pages) {
    if (!page.visibleText || page.visibleText.length < 20) continue;
    pagesAnalysed.push(page.url);

    // 1. Custom rules
    const custom = applyCustomRules(page.visibleText, page.url);
    allIssues.push(...custom);

    // 2. LanguageTool (if available)
    if (ltAvailable && languageToolUrl) {
      const lt = await callLanguageTool(page.visibleText, page.url, languageToolUrl);
      allIssues.push(...lt);
    }
  }

  // Deduplicate: same ruleId + pageUrl + match
  const seen = new Set<string>();
  const unique = allIssues.filter((i) => {
    const key = `${i.ruleId}::${i.pageUrl}::${i.match}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    issues: unique,
    languageToolAvailable: ltAvailable,
    pagesAnalysed,
  };
}
