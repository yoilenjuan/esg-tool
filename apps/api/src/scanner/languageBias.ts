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
  // Gendered titles — ES + EN
  {
    id: 'ESG_GENDER_TITLE_SR',
    description: 'Gendered salutation excludes non-binary customers',
    pattern: /\b(Sr\.|Sra\.|señor|señora|señorita|Mr\.|Mrs\.|Miss\b|Ms\.)\b/gi,
    suggestion: 'Replace with neutral alternatives ("Customer", "Person") or ask for preferred salutation at profile stage',
  },
  // Binary gender only — ES + EN
  {
    id: 'ESG_GENDER_BINARY_SELECT',
    description: 'Binary-only gender options exclude non-binary identities',
    pattern: /\b(hombre|mujer)\b[\s/|\\]+\b(mujer|hombre)\b|\b(male|female)\b[\s/|\\]+\b(female|male)\b/gi,
    suggestion: 'Add non-binary option and/or free-text "prefer to self-describe" field',
  },
  // Heteronormative assumptions — ES + EN
  {
    id: 'ESG_HETERONORMATIVE',
    description: 'Heteronormative copy assumes male-female couples',
    pattern: /\b(marido|esposo|esposa|mujer e hijos|madre y padre|padres e hijos|husband|wife\b|boyfriend|girlfriend)\b/gi,
    suggestion: 'Replace with "pareja" / "partner", "persona a su cargo" / "dependent", "familia" / "family"',
  },
  // Ageist terms — ES + EN
  {
    id: 'ESG_AGEIST_TERM',
    description: 'Ageist phrasing in page copy',
    pattern: /\b(ancian[oa]s?|vejez|tercera edad|cuarto sector|adulto mayor|elderly|senior citizen|the aged|old people|pensioner)\b/gi,
    suggestion: 'Replace with "personas mayores" / "older adults" — age-neutral, respectful language',
  },
  // Nationality bias — ES + EN
  {
    id: 'ESG_NATIONALITY_BIAS',
    description: '"Extranjero" / "foreign" in identity context may exclude non-nationals',
    pattern: /\b(extranjero|extranjera|foreign national|non-resident alien|non-citizen)\b/gi,
    suggestion: 'Clarify policy applies to all customers regardless of nationality',
  },
  // Nationality field labels — ES + EN
  {
    id: 'ESG_NATIONALITY_SELECT_LABEL',
    description: 'Nationality field detected — verify GDPR legal basis',
    pattern: /\bnacionalidad\b|\bnationality\b/gi,
    suggestion: 'Ensure a documented GDPR legal basis exists; do not use for marketing segmentation',
  },
  // Document exclusion — ES + EN
  {
    id: 'ESG_DOCUMENT_SPANISH_ONLY',
    description: 'National ID / document field may block foreign nationals',
    pattern: /\b(dni)\b.*\b(obligatorio|requerido|required)\b|\b(national\s+id|id\s+number)\b.*\b(required|mandatory|obligatory)\b/gi,
    suggestion: 'Accept NIE, passport, and other EU/international document types as valid alternatives',
  },
  // Age gating — ES + EN
  {
    id: 'ESG_AGE_GATE_ONLY',
    description: 'Age gate detected — ensure alternative verification pathway exists',
    pattern: /\b(mayor[es]?\s+de\s+18|18\s+años|age\s*gate|must\s+be\s+18|18\s+or\s+over|over\s+18|years?\s+of\s+age)\b/gi,
    suggestion: 'Provide an alternative verification pathway for users unable to supply digital ID',
  },
  // Binary gender copy — standalone label (e.g. "Male / Female" without a matching pair covered above)
  {
    id: 'ESG_GENDER_BINARY_COPY',
    description: 'Standalone binary gender label in page copy (Male/Female without inclusive alternative)',
    pattern: /(?<!\w)(male|female)(?!\w)(?!.*\b(non-binary|other|prefer not|diverse|agender)\b)/gi,
    suggestion: 'Add non-binary or self-describe option alongside Male/Female labels',
  },
  // Gendered imperative copy — EN (e.g. "shop for her", "gifts for him")
  {
    id: 'ESG_GENDERED_COPY_EN',
    description: 'Gender-targeted copy segments customers by assumed gender',
    pattern: /\b(for\s+her|for\s+him|gifts?\s+for\s+(?:him|her)|shop\s+(?:his|her)\s+style|men['']?s\s+(?:collection|section)|women['']?s\s+(?:collection|section))\b/gi,
    suggestion: 'Use product-category language instead of gender: "Coffee Machines", "Accessories" rather than "For Her"',
  },
  // Title/salutation field label — EN
  {
    id: 'ESG_TITLE_FIELD_EN',
    description: 'Title/salutation field with binary options (Mr/Mrs) detected',
    pattern: /\b(title|salutation|honorific)\b[\s\S]{0,60}\b(mr|mrs|miss|ms)\b/gi,
    suggestion: 'Add "Mx" or "Prefer not to say" option, or remove the title field entirely',
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
