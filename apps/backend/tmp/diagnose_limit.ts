import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- START DIAGNOSIS ---');

  // Find all FREE organizations
  const orgs = await prisma.organization.findMany({
    where: { plan: 'FREE' },
    select: { id: true, name: true, scanCount: true }
  });

  for (const org of orgs) {
    // Count all documents for this org
    const docCount = await prisma.document.count({
      where: { organizationId: org.id }
    });

    console.log(`Org: ${org.name} (${org.id})`);
    console.log(`- scanCount (Plan field): ${org.scanCount}`);
    console.log(`- Document Table Row Count: ${docCount}`);

    if (docCount > 10) {
      console.log('--- Document Status Breakdown ---');
      const docs = await prisma.document.findMany({
        where: { organizationId: org.id },
        orderBy: { uploadedAt: 'desc' },
        take: 15,
        select: {
          id: true,
          uploadedAt: true,
          status: true,
          originalFileName: true
        }
      });

      const statusCounts: Record<string, number> = {};
      docs.forEach(d => {
        statusCounts[d.status] = (statusCounts[d.status] || 0) + 1;
      });

      console.log('Status Counts (latest 15):', statusCounts);
      
      console.log('Details for latest 13 documents (Ordered by Upload Time):');
      // Sort by uploadedAt ascending to see sequence
      const sortedDocs = [...docs].sort((a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime());
      
      sortedDocs.slice(0, 13).forEach((d, i) => {
        console.log(`[#${i + 1}] ${d.uploadedAt.toISOString()} | Status: ${d.status.padEnd(12)} | ${d.originalFileName}`);
      });
    }
  }

  console.log('--- END DIAGNOSIS ---');
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
