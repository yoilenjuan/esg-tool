import express, { Express } from 'express';
import cors from 'cors';
import * as path from 'path';
import { scanRouter } from './routes/scan';
import { reportRouter } from './routes/report';

const app: Express = express();
const PORT = process.env.PORT || 3001;
const RUNS_DIR = path.resolve(__dirname, '..', '..', '..', 'runs');

app.use(cors({ origin: process.env.WEB_ORIGIN || 'http://localhost:3000' }));
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
  console.log(`   Runs directory: ${RUNS_DIR}\n`);
});

export default app;
