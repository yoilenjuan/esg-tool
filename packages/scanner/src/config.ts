import { ScanDepth } from '@esg/shared';

export interface ScannerConfig {
  maxPages: number;
  depth: ScanDepth;
  recordVideo: boolean;
  outputDir: string;
  userAgent: string;
  navigationTimeoutMs: number;
  rateDelayMs: number;
}

export function buildConfig(
  outputDir: string,
  maxPages: number,
  depth: ScanDepth,
  recordVideo: boolean
): ScannerConfig {
  const timeouts: Record<ScanDepth, number> = {
    light: 15_000,
    standard: 25_000,
    deep: 40_000,
  };
  const delays: Record<ScanDepth, number> = {
    light: 500,
    standard: 1000,
    deep: 1500,
  };
  return {
    maxPages,
    depth,
    recordVideo,
    outputDir,
    userAgent:
      'Mozilla/5.0 (compatible; ESGBiasScanner/1.0; +https://github.com/your-org/esg-bias-scanner)',
    navigationTimeoutMs: timeouts[depth],
    rateDelayMs: delays[depth],
  };
}
