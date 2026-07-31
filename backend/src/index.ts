import express from 'express';
import cors from 'cors';
import serverless from 'serverless-http';
import routes from './routes';
import multiStageRoutes from './multiStageRoutes';

const app = express();

app.use(cors());
app.use(express.json());
app.use('/api', routes);
app.use('/api', multiStageRoutes);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// For local development
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Lambda handler
export const handler = serverless(app);
