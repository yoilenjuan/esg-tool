import { PageResult } from './crawler';

export interface LanguageIssue {
  pageUrl: string;
  match: string;
  suggestion: string;
  context: string;
}

/** Inclusive-language ruleset for Spanish + English (retail scope) */
const RULES: Array<{ pattern: RegExp; suggestion: string }> = [
  // Spanish gendered language
  { pattern: /\blos\s+clientes\b/gi, suggestion: 'Use "la clientela" or "las personas clientas"' },
  { pattern: /\bel\s+usuario\b/gi, suggestion: 'Use "la persona usuaria" or "el/la usuario/a"' },
  { pattern: /\bnuestros\s+compradores\b/gi, suggestion: 'Use "nuestra clientela compradora"' },
  { pattern: /\bsr\.\s*\/\s*sra\.\b/gi, suggestion: 'Offer a non-binary honorific option (Mx.)' },
  { pattern: /\bsra\.\b/gi, suggestion: 'Consider adding Mx. as a non-binary option' },
  { pattern: /\bdon\/doña\b/gi, suggestion: 'Offer a non-binary honorific option (Mx.)' },
  // English gendered language
  { pattern: /\bhe\s+or\s+she\b/gi, suggestion: 'Use singular "they"' },
  { pattern: /\bhis\/her\b/gi, suggestion: 'Use "their"' },
  { pattern: /\bguys\b/gi, suggestion: 'Use "folks", "everyone", or "y\'all"' },
  { pattern: /\bchairman\b/gi, suggestion: 'Use "chairperson" or "chair"' },
  { pattern: /\bsalesman\b/gi, suggestion: 'Use "salesperson"' },
  // Age-related stereotypes
  { pattern: /\belderly\s+customers\b/gi, suggestion: 'Use "older customers" or "customers aged 65+"' },
  { pattern: /\bfor\s+seniors\b/gi, suggestion: 'Avoid age-segmented copy; use inclusive framing' },
  // Nationality / exclusion
  { pattern: /\bonly\s+(spanish|spanish-speaking)\b/gi, suggestion: 'Provide multi-language access; avoid exclusion' },
];

export interface LanguageAnalysisResult {
  issues: LanguageIssue[];
  affectedPages: string[];
}

export function analyzeLanguage(pages: PageResult[]): LanguageAnalysisResult {
  const issues: LanguageIssue[] = [];
  const affectedPages = new Set<string>();

  for (const page of pages) {
    // Strip HTML tags for text analysis
    const text = page.html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ');

    for (const rule of RULES) {
      let match: RegExpExecArray | null;
      const re = new RegExp(rule.pattern.source, rule.pattern.flags);
      while ((match = re.exec(text)) !== null) {
        const start = Math.max(0, match.index - 40);
        const end = Math.min(text.length, match.index + match[0].length + 40);
        issues.push({
          pageUrl: page.url,
          match: match[0],
          suggestion: rule.suggestion,
          context: `…${text.slice(start, end)}…`,
        });
        affectedPages.add(page.url);
      }
    }
  }

  return { issues, affectedPages: [...affectedPages] };
}
