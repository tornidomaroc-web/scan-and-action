const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const userId = "4ef30f96-0a41-45ad-a327-5745f0c7bcbf";
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        include: {
          organization: true
        }
      }
    }
  });

  if (!user) {
    console.log("User not found!");
    return;
  }

  console.log(`User ${user.email} has ${user.memberships.length} memberships:`);
  user.memberships.forEach((m, i) => {
    console.log(`${i+1}. Org: ${m.organization.name} | ID: ${m.organizationId}`);
  });
}

main().finally(() => prisma.$disconnect());
