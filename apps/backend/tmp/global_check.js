const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('--- GLOBAL SCANCOUNT CHECK ---');

  try {
    const orgs = await prisma.organization.findMany({
      where: { scanCount: { gt: 0 } },
      select: { id: true, name: true, scanCount: true }
    });

    console.log(`Organizations with scanCount > 0: ${orgs.length}`);
    console.log(JSON.stringify(orgs, null, 2));

    const totalDocs = await prisma.document.count();
    console.log(`Total documents in system: ${totalDocs}`);

    const docStatuses = await prisma.document.groupBy({
      by: ['status'],
      _count: true
    });
    console.log('Global Document Statuses:');
    console.log(JSON.stringify(docStatuses, null, 2));

  } catch (err) {
    console.error('Error during check:', err);
  }

  console.log('--- END GLOBAL CHECK ---');
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
