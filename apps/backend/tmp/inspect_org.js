const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('--- TARGET ORG FULL INSPECTION ---');

  try {
    const orgId = '07ce48d1-b292-4de3-a8df-2fc157adc527';
    const org = await prisma.organization.findUnique({
      where: { id: orgId }
    });

    console.log('Organization Record from DB:');
    console.log(JSON.stringify(org, null, 2));

    const docCount = await prisma.document.count({
      where: { organizationId: orgId }
    });
    console.log(`Document Table Count: ${docCount}`);

    const completedDocs = await prisma.document.findMany({
      where: { organizationId: orgId, status: 'COMPLETED' },
      select: { id: true, uploadedAt: true }
    });
    console.log(`COMPLETED Documents: ${completedDocs.length}`);

  } catch (err) {
    console.error('Error during inspection:', err);
  }

  console.log('--- END INSPECTION ---');
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
