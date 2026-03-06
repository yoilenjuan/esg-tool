#!/usr/bin/env node
/**
 * ESG Retail Bias Scanner – CLI runner
 * Usage: pnpm scan --url https://example.com [--depth light|standard|deep] [--max-pages 20] [--video]
 */
import * as path from 'path';
import { runScan } from './pipeline';
import type { ScanDepth } from '@esg/shared';

function parseArgs(): {
  url: string;
  depth: ScanDepth;
  maxPages: number;
  recordVideo: boolean;
} {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };
  const url = get('--url') || args.find((a) => a.startsWith('http'));
  if (!url) {
    console.error('Error: --url <URL> is required.\nUsage: pnpm scan --url https://example.com [--depth light|standard|deep] [--max-pages 20] [--video]');
    process.exit(1);
  }
  const depth = (get('--depth') as ScanDepth) || 'standard';
  const maxPages = parseInt(get('--max-pages') || '15', 10);
  const recordVideo = args.includes('--video');
  return { url, depth, maxPages, recordVideo };
}

async function main() {
  const { url, depth, maxPages, recordVideo } = parseArgs();
  const runsDir = path.resolve(process.cwd(), '..', '..', 'runs');

  console.log('\n🔍 ESG Retail Bias Scanner\n');
  console.log(`Target : ${url}`);
  console.log(`Depth  : ${depth}`);
  console.log(`Max pgs: ${maxPages}`);
  console.log(`Video  : ${recordVideo}`);
  console.log('─────────────────────────────────\n');

  try {
    const run = await runScan(
      { url, depth, maxPages, recordVideo },
      runsDir,
      (progress) => {
        const bar = '█'.repeat(Math.floor(progress.percentComplete / 5)).padEnd(20, '░');
        process.stdout.write(
          `\r[${bar}] ${progress.percentComplete}%  ${progress.currentStep.padEnd(45)}`
        );
      }
    );

    console.log('\n\n─────────────────────────────────');
    console.log(`✅ Scan completed — Run ID: ${run.runId}`);
    console.log(`📊 Overall Inclusivity Score: ${run.overallScore}/100`);
    console.log(`📄 Report JSON: runs/${run.runId}/report.json`);
    console.log('\n📋 Dimension Summary:');
    for (const finding of run.findings) {
      const icon =
        finding.status === 'Complies' ? '✅'
        : finding.status === 'Does Not Comply' ? '❌'
        : finding.status === 'Partially Complies' ? '⚠️'
        : finding.status === 'Not Requested' ? '—'
        : '🔀';
      console.log(`  ${icon}  ${finding.dimensionLabel.padEnd(40)} ${finding.status}`);
    }
    console.log('\n💡 Tip: Run the web UI (pnpm dev) for a visual report + PDF download.\n');
  } catch (err) {
    console.error('\n\n❌ Scan failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
