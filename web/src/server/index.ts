import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import tasksRouter from './routes/tasks';
import dashboardRouter from './routes/dashboard';
import graphRouter from './routes/graph';
import knowledgeRouter from './routes/knowledge';

const app = express();
const PORT = Number(process.env.WEB_PORT) || 3001;

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api', tasksRouter);
app.use('/api', dashboardRouter);
app.use('/api', graphRouter);
app.use('/api', knowledgeRouter);

app.listen(PORT, () => {
  console.log(`Atlas Command Center API running on http://localhost:${PORT}`);
});

export default app;
