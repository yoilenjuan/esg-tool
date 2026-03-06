# ESG Retail Bias Scanner

A web tool that scans retail company websites, detects inclusivity and bias issues across **8 dimensions**, captures evidence (screenshots + optional video), and generates concise PDF reports with findings, recommendations, and sales-impact analysis.

---

## Table of Contents

- [Architecture](#architecture)
- [Dimensions Scanned](#dimensions-scanned)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Running](#running)
- [CLI Usage](#cli-usage)
- [Example Output](#example-output)
- [Project Structure](#project-structure)
- [Limitations & Ethics](#limitations--ethics)
- [Roadmap](#roadmap)

---

## Architecture

```
esg-retail-bias-scanner/
├── apps/
│   ├── web/          Next.js 14 + TypeScript + Tailwind   (port 3000)
│   └── api/          Express + TypeScript                  (port 3001)
├── packages/
│   ├── shared/       Shared TypeScript types
│   ├── scanner/      Playwright-based scan pipeline
│   └── report/       HTML template + PDF generator
└── runs/             Output directory (one folder per runId)
    └── example/      Mock example run output
```

**Monorepo** managed with **pnpm workspaces**.

---

## Dimensions Scanned

| # | Dimension | What is checked |
|---|-----------|----------------|
| 1 | **Gender** | Binary-only selects, gendered titles (Sr./Sra.), missing neutral options |
| 2 | **Email Internationalisation (EAI)** | Accepts / rejects Unicode email addresses (RFC 6532) |
| 3 | **Nationality** | Field present? Closed list? Self-description available? |
| 4 | **Country** | Selector coverage (195+ countries), no single-country default |
| 5 | **Civil / Marital Status** | Heteronormative-only options? Non-traditional family structures included? |
| 6 | **Age** | Required DOB? Age gates? Stereotyped copy? |
| 7 | **Race & Ethnicity** | Approximate visual diversity on hero/landing pages (non-identifying heuristic) |
| 8 | **Legal Document** | DNI-only vs passport + NIE + multi-doc acceptance |

**Statuses:** Complies · Partially Complies · Does Not Comply · Not Requested · Mixed / Multi-flow

---

## Prerequisites

- **Node.js** ≥ 18.0.0
- **pnpm** ≥ 8.0.0 — install with `npm install -g pnpm`
- Playwright Chromium browsers (installed automatically)

---

## Setup

```bash
# 1. Clone / open the workspace
cd "ESG Tool"

# 2. Install all workspace dependencies
pnpm install

# 3. Install Playwright browsers
pnpm --filter scanner exec playwright install chromium

# 4. (Optional) copy example env
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env
```

### Environment variables

**`apps/web/.env.local`**
```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

**`apps/api/.env`**
```
PORT=3001
WEB_ORIGIN=http://localhost:3000
```

---

## Running

### Development (web + API together)

```bash
pnpm dev
```

- Web UI: http://localhost:3000
- API:    http://localhost:3001/api/health

### Build for production

```bash
pnpm build
```

### Run tests

```bash
pnpm test
```

---

## CLI Usage

Run a scan directly from the terminal (useful for debugging and automation):

```bash
# Basic scan
pnpm scan --url https://www.zara.com

# With options
pnpm scan --url https://www.mango.com --depth deep --max-pages 30 --video
```

**Options:**

| Flag | Default | Description |
|------|---------|-------------|
| `--url <url>` | *(required)* | Target URL to scan |
| `--depth light\|standard\|deep` | `standard` | Scan depth |
| `--max-pages <n>` | `15` | Maximum pages to crawl |
| `--video` | off | Record a .webm video of the session |

**Output:**
- `runs/<runId>/report.json` — Full structured result
- `runs/<runId>/report.pdf` — PDF report (generated after scan)
- `runs/<runId>/screenshots/` — PNG screenshots
- `runs/<runId>/videos/` — .webm video (if `--video`)

---

## Example Output

See [`runs/example/report.json`](runs/example/report.json) for a complete mock run output demonstrating all 8 dimensions, evidence references, recommendations, and sales-impact analysis.

**Overall score: 47/100** for a fictional retailer with the following findings:

| Dimension | Status |
|-----------|--------|
| Gender | Does Not Comply |
| Email Internationalisation | Does Not Comply |
| Nationality | Not Requested |
| Country | Partially Complies |
| Civil / Marital Status | Does Not Comply |
| Age | Partially Complies |
| Race & Ethnicity | Partially Complies |
| Legal Document | Does Not Comply |

---

## Project Structure

```
packages/shared/src/
  types.ts              All shared TypeScript interfaces + constants

packages/scanner/src/
  pipeline.ts           Main orchestrator (crawl → analyse → evidence → report JSON)
  crawler.ts            Playwright crawler with robots.txt respect + priority queuing
  config.ts             Scan configuration builder
  languageAnalyzer.ts   Inclusive-language heuristics (ES + EN)
  evidenceCapture.ts    Screenshot + video evidence helpers
  dimensionSummarizer.ts Maps raw analysis to DimensionFinding objects
  analyzers/
    gender.ts           Gender field + title detection
    email.ts            EAI probe (Unicode email validation)
    nationality.ts      Nationality field analysis
    country.ts          Country selector coverage
    civilStatus.ts      Civil status options
    age.ts              DOB, age gates, stereotyped copy
    raceEthnicity.ts    Visual diversity heuristic (non-identifying)
    legalDocument.ts    Document type acceptance

packages/report/src/
  htmlTemplate.ts       Full HTML report template
  pdfGenerator.ts       Playwright page.pdf() generator

apps/api/src/
  index.ts              Express server entry
  routes/scan.ts        POST /api/scan, GET /api/scan/:id/progress
  routes/report.ts      GET /api/report/:id, /pdf, /html

apps/web/src/
  app/page.tsx          Single-page UI (idle → scanning → results)
  components/
    ScanForm.tsx        URL + options form
    ScanProgress.tsx    Polling progress bar
    ResultsView.tsx     Score card + evidence table
    DimensionCard.tsx   Expandable finding card (issues + recommendations + sales impact)
```

---

## Limitations & Ethics

1. **Visual diversity scoring is approximate and heuristic-only.** It is based on image count and alt-text variety — it does **not** identify, classify, or make assumptions about individuals.

2. **robots.txt is respected.** The scanner reads and honours `Disallow` directives for `User-agent: *`.

3. **Rate limiting is built in.** A configurable delay is applied between page requests to avoid overloading target servers.

4. **Domain-scoped only.** The crawler never follows links outside the target domain.

5. **EAI probing is non-destructive.** Email fields are filled with test values and blurred; no forms are actually submitted.

6. **Results are indicative.** The scanner is an automated heuristic tool. Manual review by an inclusivity specialist is strongly recommended before acting on findings.

7. **No PII collected.** No user data, cookies (beyond session navigation), or personal data is stored.

---

## Roadmap

- [ ] LanguageTool HTTP integration for richer inclusive-language detection
- [ ] WCAG accessibility dimension
- [ ] Multi-locale / multi-subdomain detection (Mixed / Multi-flow status)
- [ ] Schedule recurring scans + trend reporting
- [ ] Slack / email notification on scan completion
- [ ] Authentication for multi-user API

---

## License

MIT
