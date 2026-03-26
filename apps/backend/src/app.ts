import express from 'express';
import cors from 'cors';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/authMiddleware';
import { WebhookController } from './controllers/webhookController';

const app = express();

// Restrict CORS to the deployed frontend origin.
// Set ALLOWED_ORIGIN in your Vercel/production environment variables.
const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: allowedOrigin }));
console.log(`[CORS] Allowed origin: ${allowedOrigin}`);

// Lemon Squeezy Webhook (Unprotected & Raw)
// MUST be registered before global express.json() to capture raw body for signature
app.post(
  '/webhooks/lemon-squeezy',
  express.raw({ type: 'application/json' }),
  WebhookController.handleLemonSqueezy
);

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
