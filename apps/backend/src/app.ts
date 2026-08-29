import express from 'express';
import cors from 'cors';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/authMiddleware';
import { WebhookController } from './controllers/webhookController';
import { isAllowedOrigin } from './corsOrigin';

const app = express();

// Railway terminates TLS at a proxy in front of us; trust exactly one hop so
// express-rate-limit keys on the real client IP from X-Forwarded-For.
app.set('trust proxy', 1);

// Restrict CORS to known frontend origins.
// Set ALLOWED_ORIGINS (comma-separated) in your Render environment variables.
// e.g. ALLOWED_ORIGINS=https://scan-and-action.vercel.app,http://localhost:5173
const rawOrigins = process.env.ALLOWED_ORIGINS || 'http://localhost:5173,https://scan-and-action.vercel.app';
const allowedOrigins = rawOrigins.split(',').map((o) => o.trim());
app.use(
  cors({
    origin(origin, callback) {
      // No Origin header means a non-browser request (Paddle webhook, health
      // check, curl) — `false` skips the CORS headers without rejecting it.
      callback(null, !!origin && isAllowedOrigin(origin, allowedOrigins));
    },
  })
);
console.log(`[CORS] Allowed origins: ${allowedOrigins.join(', ')} + Vercel previews of this project`);

// Paddle Webhook (Unprotected & Raw)
// MUST be registered before global express.json() to capture raw body for signature
app.post(
  '/api/webhook/paddle',
  express.raw({ type: 'application/json' }),
  WebhookController.handlePaddle
);

// JSON bodies are small (search queries, status updates, fix actions).
// File uploads go through multer as multipart, not JSON, so 1mb is generous.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Health check for deployment verification
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', environment: process.env.NODE_ENV, timestamp: new Date().toISOString() });
});

// Deploy provenance: which commit is this process running?
//
// PLACEMENT IS THE AUTH DECISION. This route is registered HERE, above the
// `app.use('/api', authMiddleware, routes)` line below, and it must stay there.
// authMiddleware is mounted on the `/api` PREFIX, so it answers every unknown
// `/api/*` path with 401 before routing happens — verified against production
// on 2026-08-29, when `GET /api/version` returned
// `401 {"error":"Missing or malformed access token"}` rather than a 404.
// A version route mounted BELOW that line would therefore be byte-identical,
// to any caller without a token, to a version route that was never deployed at
// all. That also rules out putting it behind auth deliberately: the incident
// class this exists to diagnose is an auth lockout, and during one nobody holds
// a working token to read it with. version.test.ts is the tripwire — it calls
// this route with no Authorization header and expects 200.
//
// SINGLE SOURCE, NO FALLBACK CHAIN. The value is read from the environment at
// request time and nowhere else. A package.json version, a build-time
// `git rev-parse`, or a hand-set variable would each keep answering
// confidently after they went stale, which is worse than the dashboard this
// replaces. Absence is reported as 503/null, never 200/"unknown", so it cannot
// be skimmed past in a report.
//
// WHAT IT MUST NEVER RETURN: environment name, DB status, dependency versions,
// uptime, hostname, region, or any echo of the request. It performs no DB
// query, so it cannot be turned into an unauthenticated load amplifier. It is
// deliberately a sibling of /api/health rather than a field on it, so that a
// 503 from this instrument can never fail a platform healthcheck.
app.get('/api/version', (req, res) => {
  const sha = process.env.RAILWAY_GIT_COMMIT_SHA;
  const ok = typeof sha === 'string' && /^[0-9a-f]{40}$/.test(sha);
  // `res.end` rather than `res.json`: res.json() attaches an ETag, and a 304 to
  // a conditional request would let an intermediary serve a stale commit — a
  // confidently wrong answer, which is the single failure this route exists to
  // prevent. Railway fronts this service with an edge proxy (observed:
  // `Server: railway-hikari`, `x-railway-edge: cdg1`), so the response says
  // no-store explicitly and carries no validator to revalidate against.
  res
    .status(ok ? 200 : 503)
    .set({ 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' })
    .end(JSON.stringify({ commit: ok ? sha : null }));
});

// Protected API routes
app.use('/api', authMiddleware, routes);

// Central Error Trap
app.use(errorHandler);

export default app;
