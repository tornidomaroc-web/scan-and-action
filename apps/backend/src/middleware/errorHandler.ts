import { Request, Response, NextFunction } from 'express';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[API Error]', err.stack || err);

  // Prisma: Unique constraint violation
  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'Conflict: A record with that unique value already exists.' });
  }

  // Prisma: Foreign key constraint violation
  if (err.code === 'P2003') {
    return res.status(400).json({ error: 'Bad Request: A referenced record does not exist.' });
  }

  // Prisma: Record not found (for update/delete operations)
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Not Found: The requested record does not exist.' });
  }

  // Zod validation errors
  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: 'Validation Error',
      details: err.flatten()
    });
  }

  // Multer file upload errors
  if (err.name === 'MulterError') {
    return res.status(400).json({ error: `Upload Error: ${err.message}` });
  }

  // Fallback
  const status = err.status || 500;
  const message = status === 500 ? 'Internal Server Error' : err.message;

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' ? { detail: err.message, stack: err.stack } : {})
  });
};

