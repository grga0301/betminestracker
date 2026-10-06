// scripts/delete-demo-doubles.ts — one-off cleanup of the hard-coded demo double that the scraper
// used to save when BetMines blocked it. Only deletes doubles whose selections are exactly the demo ones.
import { prisma } from '../src/lib/db/prisma';

async function main() {
  const doubles = await prisma.betDouble.findMany({ include: { selections: true } });
  const demo = doubles.filter(
    (d) =>
      d.selections.length === 2 &&
      d.selections.some((s) => s.homeTeam === 'SC Freiburg' && s.awayTeam === 'Sporting Braga') &&
      d.selections.some((s) => s.homeTeam === 'Sleipner' && s.awayTeam === 'Syrianska')
  );
  for (const d of demo) console.log(`deleting demo double id=${d.id} date=${d.date} status=${d.status}`);
  if (demo.length > 0) await prisma.betDouble.deleteMany({ where: { id: { in: demo.map((d) => d.id) } } });
  console.log(`Deleted ${demo.length} demo double(s).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
