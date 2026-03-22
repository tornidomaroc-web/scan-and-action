import { PrismaClient } from '@prisma/client';

// Singleton PrismaClient — import this everywhere instead of creating new instances.
// In production, this avoids connection pool exhaustion.
// In development with tsx watch, the global cache prevents duplicate clients on hot-reload.

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
