import { PrismaClient } from '@prisma/client';
import { DocumentController } from './src/controllers/documentController';
import fs from 'fs';

// Mock Express Request/Response
const prisma = new PrismaClient();

async function capture() {
  const mockUser = {
    id: '4ef30f96-0a41-45ad-a327-5745f0c7bcbf',
    email: 'justin.nikimiki@gmail.com',
    organizationId: 'd8b34ee3-bd14-4262-a67b-99d42374b6c1'
  };

  const createMockRes = (name: string) => ({
    status: (code: number) => {
      console.log(`[${name}] Status: ${code}`);
      return {
        json: (data: any) => {
          console.log(`[${name}] Data captured (count: ${data.length || 'n/a'})`);
          fs.writeFileSync(`${name}_response.json`, JSON.stringify({
            status: code,
            count: data.length,
            body: data
          }, null, 2));
        }
      };
    }
  } as any);

  console.log('--- CAPTURING API PAYLOADS ---');

  // 1. Capture Review Queue
  console.log('Capturing /api/review...');
  await DocumentController.getReviewQueue(
    { user: mockUser } as any,
    createMockRes('review'),
    (err: any) => console.error('Review Error:', err)
  );

  // 2. Capture Recent Activity
  console.log('Capturing /api/documents/recent...');
  await DocumentController.getRecentDocuments(
    { user: mockUser } as any,
    createMockRes('recent'),
    (err: any) => console.error('Recent Error:', err)
  );

  console.log('--- CAPTURE COMPLETE ---');
}

capture().finally(() => prisma.$disconnect());
