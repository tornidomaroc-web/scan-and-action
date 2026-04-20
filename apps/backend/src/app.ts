import express from 'express';
import cors from 'cors';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/authMiddleware';
import { WebhookController } from './controllers/webhookController';

const app = express();

// Restrict CORS to known frontend origins.
// Set ALLOWED_ORIGINS (comma-separated) in your Render environment variables.
// e.g. ALLOWED_ORIGINS=https://scan-and-action.vercel.app,http://localhost:5173
const rawOrigins = process.env.ALLOWED_ORIGINS || 'http://localhost:5173,https://scan-and-action.vercel.app';
const allowedOrigins = rawOrigins.split(',').map((o) => o.trim());
app.use(cors({ origin: allowedOrigins }));
console.log(`[CORS] Allowed origins: ${allowedOrigins.join(', ')}`);

// Paddle Webhook (Unprotected & Raw)
// MUST be registered before global express.json() to capture raw body for signature
app.post(
  '/api/webhook/paddle',
  express.raw({ type: 'application/json' }),
  WebhookController.handlePaddle
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
