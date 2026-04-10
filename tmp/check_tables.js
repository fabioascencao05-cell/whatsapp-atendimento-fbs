const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const tables = await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE tablename LIKE '_%'`);
    console.log('--- TABELAS OCULTAS ENCONTRADAS ---');
    console.log(JSON.stringify(tables, null, 2));
    console.log('------------------------------------');
  } catch (err) {
    console.error('❌ Erro ao consultar tabelas:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
