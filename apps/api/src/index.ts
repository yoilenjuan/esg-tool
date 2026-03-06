import express, { Express } from 'express';
import cors from 'cors';
import * as path from 'path';
import { scanRouter } from './routes/scan';
import { reportRouter } from './routes/report';

const app: Express = express();
const PORT = process.env.PORT || 3001;
const RUNS_DIR = process.env.RUNS_DIR || path.resolve(__dirname, '..', '..', '..', 'runs');

// Support comma-separated list of allowed origins, e.g.
// WEB_ORIGIN=https://esg-tool.vercel.app,http://localhost:3000
const allowedOrigins = (process.env.WEB_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, cb) => {
      // allow requests with no origin (curl, server-to-server)
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return cb(null, true);
      }
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
  }),
);
app.use(express.json());

// Static files for evidence (screenshots / videos)
app.use('/runs', express.static(RUNS_DIR));

// Routes
app.use('/api/scan', scanRouter(RUNS_DIR));
app.use('/api/report', reportRouter(RUNS_DIR));
app.use('/api/runs', reportRouter(RUNS_DIR));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`\n🚀 ESG Bias Scanner API running on http://localhost:${PORT}`);
  console.log(`   Runs directory : ${RUNS_DIR}`);
  console.log(`   Allowed origins: ${allowedOrigins.join(', ')}`);
  console.log(`   Node version   : ${process.version}`);
  console.log(`   Environment    : ${process.env.NODE_ENV ?? 'development'}\n`);
});

// Surface unhandled promise rejections so Railway logs capture them
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err.message);
  console.error(err.stack);
});

export default app;
