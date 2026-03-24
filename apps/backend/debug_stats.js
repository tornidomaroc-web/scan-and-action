const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    console.log('Testing Prisma stats queries...');
    
    // Get first organization to test with
    const org = await prisma.organization.findFirst();
    if (!org) {
      console.log('No organization found to test with.');
      return;
    }
    const organizationId = org.id;
    console.log('Using organizationId:', organizationId);

    const stats = await Promise.all([
      prisma.document.count({ where: { organizationId } }),
      prisma.document.count({
        where: {
          organizationId,
          OR: [
            { status: 'NEEDS_REVIEW' },
            { overallConfidence: { lt: 0.8 } }
          ]
        }
      }),
      prisma.document.aggregate({
        where: { organizationId },
        _avg: { overallConfidence: true }
      })
    ]);

    console.log('Stats results:', JSON.stringify(stats, null, 2));
    console.log('Success!');
  } catch (err) {
    console.error('Prisma test failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

test();
