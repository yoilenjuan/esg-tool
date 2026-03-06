import { Router, Request, Response, IRouter } from 'express';
import * as path from 'path';
import * as fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';
import { runApiScan, ApiScanOptions } from '../scanner/runScanner';
import {
  ScanProgress,
  StartScanRequest,
  StartScanResponse,
  ProgressResponse,
  RunStatus,
} from '@esg/shared';

// In-memory progress store (sufficient for single-server MVP)
const progressStore = new Map<string, ScanProgress>();

export function scanRouter(runsBaseDir: string): IRouter {
  const router = Router();

  /**
   * POST /api/scan
   * Start a new scan. Returns runId immediately; scan runs in background.
   */
  router.post('/', async (req: Request, res: Response) => {
    const body = req.body as StartScanRequest;
    const { options } = body;

    // Validate
    if (!options?.url) {
      return res.status(400).json({ error: 'options.url is required' });
    }
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(options.url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return res.status(400).json({ error: 'Only http/https URLs are supported' });
    }

    const scanOptions: ApiScanOptions = {
      url: parsedUrl.href,
      depth: (options.depth as ApiScanOptions['depth']) || 'standard',
      recordVideo: options.recordVideo ?? false,
      maxPages: Math.min(options.maxPages ?? 15, 50), // cap at 50
    };

    const runId = uuidv4();
    const startedAt = new Date().toISOString();

    // Initialise progress
    progressStore.set(runId, {
      runId,
      status: 'queued',
      currentStep: 'Queued…',
      pagesDiscovered: 0,
      pagesScanned: 0,
      percentComplete: 0,
      startedAt,
    });

    // Respond immediately
    const response: StartScanResponse = { runId, message: 'Scan started' };
    res.status(202).json(response);

    // Run scan in background (fire-and-forget)
    setImmediate(async () => {
      try {
        progressStore.set(runId, {
          ...progressStore.get(runId)!,
          status: 'running',
          currentStep: 'Launching browser…',
          percentComplete: 1,
        });

        await runApiScan(scanOptions, runsBaseDir, runId, (update) => {
          progressStore.set(runId, {
            runId: update.runId,
            status: update.status as RunStatus,
            currentStep: update.currentStep,
            pagesDiscovered: update.pagesDiscovered,
            pagesScanned: update.pagesScanned,
            percentComplete: update.percentComplete,
            startedAt: update.startedAt,
            completedAt: update.completedAt,
            errorMessage: update.errorMessage,
          });
        });

        // Mark completed
        const existing = progressStore.get(runId)!;
        progressStore.set(runId, {
          ...existing,
          status: 'completed',
          percentComplete: 100,
          currentStep: 'Scan complete.',
          completedAt: new Date().toISOString(),
        });
      } catch (err) {
        const eg = progressStore.get(runId);
        progressStore.set(runId, {
          ...(eg ?? {
            runId,
            startedAt,
            pagesDiscovered: 0,
            pagesScanned: 0,
            percentComplete: 0,
          }),
          status: 'failed' as RunStatus,
          currentStep: 'Failed.',
          errorMessage: err instanceof Error ? err.message : String(err),
          completedAt: new Date().toISOString(),
        } as ScanProgress);
      }
    });
  });

  /**
   * GET /api/scan/:runId/progress
   */
  router.get('/:runId/progress', (req: Request, res: Response) => {
    const { runId } = req.params;
    const progress = progressStore.get(runId);
    if (!progress) {
      // Check if a report.json exists (e.g., pre-existing run)
      const reportPath = path.join(runsBaseDir, runId, 'report.json');
      if (fs.existsSync(reportPath)) {
        return res.json({
          progress: {
            runId,
            status: 'completed',
            currentStep: 'Scan complete.',
            pagesDiscovered: 0,
            pagesScanned: 0,
            percentComplete: 100,
            startedAt: new Date().toISOString(),
          } as ScanProgress,
        } as ProgressResponse);
      }
      return res.status(404).json({ error: `Run ${runId} not found` });
    }
    res.json({ progress } as ProgressResponse);
  });

  return router;
}
