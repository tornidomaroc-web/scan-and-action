const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('--- FINAL RUNTIME VERIFICATION ---');

  try {
    const orgId = '07ce48d1-b292-4de3-a8df-2fc157adc527';
    const org = await prisma.organization.findUnique({
      where: { id: orgId }
    });

    console.log('Runtime Organization Object:');
    console.log(JSON.stringify(org, null, 2));

    if (org && typeof org.scanCount === 'number') {
      console.log('VERIFICATION: Runtime Prisma Client successfully recognizes scanCount.');
    } else {
      console.log('VERIFICATION FAILED: scanCount is missing or not a number.');
    }

  } catch (err) {
    console.error('Runtime error during verification:', err);
  }

  console.log('--- END VERIFICATION ---');
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
