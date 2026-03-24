const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function checkConnection() {
  try {
    console.log('Connecting to:', process.env.DATABASE_URL.replace(/:[^:@]+@/, ':***@'));
    await prisma.$connect();
    console.log('Connection successful!');
    const count = await prisma.user.count();
    console.log('User count:', count);
  } catch (error) {
    console.error('Connection failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkConnection();
