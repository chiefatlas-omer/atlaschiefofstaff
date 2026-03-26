import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import tasksRouter from './routes/tasks';
import dashboardRouter from './routes/dashboard';
import graphRouter from './routes/graph';
const app = express();
const PORT = Number(process.env.WEB_PORT) || 3001;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes - order matters in Express 5
app.use('/api', tasksRouter);
app.use('/api', dashboardRouter);
app.use('/api', graphRouter);

// Knowledge router loaded via require to isolate its heavy bot imports
try {
  const knowledgeMod = require('./routes/knowledge');
  app.use('/api', knowledgeMod.default || knowledgeMod);
} catch (err: any) {
  console.error('[server] Knowledge routes failed:', err.message);
}

app.listen(PORT, () => {
  console.log(`Atlas Command Center API running on http://localhost:${PORT}`);
});

export default app;
