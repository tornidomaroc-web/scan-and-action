const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('--- DB SCHEMA CHECK ---');

  try {
    const rawQueryResult = await prisma.$queryRaw`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'Organization';
    `;
    console.log(JSON.stringify(rawQueryResult, null, 2));
  } catch (err) {
    console.error('Error during schema check:', err);
  }

  console.log('--- END DB SCHEMA CHECK ---');
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
