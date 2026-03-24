import express from 'express';
import cors from 'cors';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/authMiddleware';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check for deployment verification
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', environment: process.env.NODE_ENV, timestamp: new Date().toISOString() });
});

// Protected API routes
app.use('/api', authMiddleware, routes);

// Central Error Trap
app.use(errorHandler);

export default app;
