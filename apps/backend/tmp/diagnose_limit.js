const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('--- START DIAGNOSIS ---');

  try {
    const orgs = await prisma.organization.findMany({
      where: { plan: 'FREE' },
      select: { id: true, name: true, scanCount: true, plan: true }
    });

    for (const org of orgs) {
      const docCount = await prisma.document.count({
        where: { organizationId: org.id }
      });

      console.log(`\nOrg: ${org.name} (${org.id})`);
      console.log(`- plan: ${org.plan}`);
      console.log(`- scanCount (Organization table field): ${org.scanCount}`);
      console.log(`- Document table row count: ${docCount}`);

      if (docCount >= 10) {
        const docs = await prisma.document.findMany({
          where: { organizationId: org.id },
          orderBy: { uploadedAt: 'asc' },
          select: {
            id: true,
            uploadedAt: true,
            status: true,
            originalFileName: true
          }
        });

        console.log(`Status breakdown for all ${docs.length} documents:`);
        const statusCounts = {};
        docs.forEach(d => {
          statusCounts[d.status] = (statusCounts[d.status] || 0) + 1;
        });
        console.log(JSON.stringify(statusCounts, null, 2));

        console.log('\nSequence of documents:');
        docs.forEach((d, i) => {
          console.log(`[#${(i + 1).toString().padStart(2)}] ${d.uploadedAt.toISOString()} | Status: ${d.status.padEnd(13)} | ${d.originalFileName}`);
        });
      }
    }
  } catch (err) {
    console.error('Error during diagnosis:', err);
  }

  console.log('\n--- END DIAGNOSIS ---');
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
