const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('--- INCREMENT TEST ---');

  const orgId = '07ce48d1-b292-4de3-a8df-2fc157adc527';
  try {
    const before = await prisma.organization.findUnique({ where: { id: orgId } });
    console.log(`ScanCount Before: ${before.scanCount}`);

    // Mimic the PersistenceService increment logic
    await prisma.organization.update({
      where: { 
        id: orgId,
        OR: [
          { plan: { not: 'FREE' } },
          { scanCount: { lt: 10 } }
        ]
      },
      data: {
        scanCount: { increment: 1 }
      }
    });

    const after = await prisma.organization.findUnique({ where: { id: orgId } });
    console.log(`ScanCount After: ${after.scanCount}`);

    if (after.scanCount === before.scanCount + 1) {
      console.log('SUCCESS: ScanCount incremented correctly in runtime!');
    } else {
      console.log('FAILURE: ScanCount did not increment.');
    }

  } catch (err) {
    console.error('Increment failed:', err.message || err);
  }

  console.log('--- END INCREMENT TEST ---');
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
