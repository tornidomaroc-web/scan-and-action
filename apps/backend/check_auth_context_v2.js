const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const userId = "4ef30f96-0a41-45ad-a327-5745f0c7bcbf";
  
  console.log(`Checking context for User ID: ${userId}`);
  
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    include: { memberships: { include: { organization: true } } }
  });

  if (!dbUser) {
    console.log("User not found in DB!");
    return;
  }

  const organizationId = dbUser.memberships[0].organizationId;
  console.log(`Associated Organization ID: ${organizationId}`);

  // Query 1: Review Queue logic
  const reviewDocs = await prisma.document.findMany({
    where: {
      organizationId: organizationId,
      OR: [
        { status: 'NEEDS_REVIEW' },
        { overallConfidence: { lt: 0.8 } }
      ]
    },
    orderBy: { uploadedAt: 'desc' },
    take: 50
  });

  console.log(`\nReview Queue found ${reviewDocs.length} items.`);
  reviewDocs.forEach(d => console.log(`- ${d.originalFileName} (${d.status}) | Confidence: ${d.overallConfidence}` ));

  // Query 2: Recent Activity logic
  const recentDocs = await prisma.document.findMany({
    where: {
      organizationId: organizationId
    },
    orderBy: { uploadedAt: 'desc' },
    take: 10
  });

  console.log(`\nRecent Activity found ${recentDocs.length} items.`);
  recentDocs.forEach(d => console.log(`- ${d.originalFileName} (${d.status}) | Confidence: ${d.overallConfidence}` ));
}

main().finally(() => prisma.$disconnect());
