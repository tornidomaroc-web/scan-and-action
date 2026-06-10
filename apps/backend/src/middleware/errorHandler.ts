import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const isProduction = process.env.NODE_ENV === 'production';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  // Correlation ID: returned to the client and written to the server log,
  // so a user-reported error can be matched to its full stack trace.
  const errorId = crypto.randomUUID();

  console.error(`[API Error] [${errorId}] ${req.method} ${req.originalUrl}`, err.stack || err);

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
