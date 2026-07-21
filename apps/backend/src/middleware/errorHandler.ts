import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import * as Sentry from '@sentry/node';
import { scrubString, formatErrorForLog } from '../redaction';

const isProduction = process.env.NODE_ENV === 'production';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  // Correlation ID: returned to the client and written to the server log,
  // so a user-reported error can be matched to its full stack trace.
  const errorId = crypto.randomUUID();

  // The stack is the primary debugging artifact for a 500, so it stays — but it
  // goes through the SAME scrubber Sentry uses (redaction.ts), so an email, a
  // token or a storage path embedded in it by Prisma/Zod/a vendor is redacted
  // identically whether it lands in Railway stdout or in Sentry. Before this,
  // beforeSend protected Sentry only and stdout got the raw text.
  //
  // A non-Error throw goes through formatErrorForLog rather than being handed to
  // console.error as an object — see the policy in redaction.ts.
  //
  // req.originalUrl is kept: verified that no route carries user content in the
  // query string (search is POST — searchRoutes.ts:7); the GET routes take UUIDs.
  const detail = typeof err?.stack === 'string' ? scrubString(err.stack) : formatErrorForLog(err);
  console.error(`[API Error] [${errorId}] ${req.method} ${req.originalUrl}`, detail);

  // Prisma: Unique constraint violation
  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'Conflict: A record with that unique value already exists.', errorId });
  }

  // Prisma: Foreign key constraint violation
  if (err.code === 'P2003') {
    return res.status(400).json({ error: 'Bad Request: A referenced record does not exist.', errorId });
  }

  // Prisma: Record not found (for update/delete operations)
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Not Found: The requested record does not exist.', errorId });
  }

  // Zod validation errors
  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: 'Validation Error',
      details: err.flatten(),
      errorId
    });
  }

  // Multer file upload errors (size/count limit violations surface here)
  if (err.name === 'MulterError') {
    return res.status(400).json({ error: `Upload Error: ${err.message}`, errorId });
  }

  const status = err.status || 500;
  const message = status === 500 ? 'Internal Server Error' : err.message;

  // Report unexpected server failures (5xx) to Sentry BEFORE responding, tagged
  // with the same errorId so a user-reported id maps to the captured event. The
  // handled 4xx above (P2002/P2003/P2025/Zod/Multer) already returned, so we only
  // reach here for 500s (or an explicit err.status >= 500). captureException is a
  // safe no-op when Sentry is not initialised (SENTRY_DSN unset). PII is stripped
  // by beforeSend (see redaction.ts) before anything leaves the process.
  if (status >= 500) {
    Sentry.captureException(err, { tags: { errorId } });
  }

  // Production: generic message + errorId only. Full details stay in server logs.
  if (isProduction) {
    return res.status(status).json({ error: message, errorId });
  }

  // Development: keep verbose errors for local debugging.
  res.status(status).json({
    error: message,
    errorId,
    detail: err.message,
    stack: err.stack
  });
};
