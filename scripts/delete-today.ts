// scripts/delete-today.ts
// Briše današnji double iz baze kako bi se moglo ponovo scrapati
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const existing = await prisma.betDouble.findUnique({ where: { date: today } });

  if (!existing) {
    console.log(`Nema zapisa za danas (${today}) u bazi.`);
    return;
  }

  await prisma.betDouble.delete({ where: { date: today } });
  console.log(`✓ Obrisan double za ${today} (id=${existing.id})`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
