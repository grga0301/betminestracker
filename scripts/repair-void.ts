// scripts/repair-void.ts — one-off: re-settle FST/FT tips that were stored as VOID only because the old
// evaluator did not know the market (or Gemini was unavailable). Uses the scores already stored.
import { prisma } from '../src/lib/db/prisma';
import { evaluateStrict } from '../src/lib/services/geminiEvaluator';

async function main() {
  let fixed = 0;
  for (const table of ['fstTip', 'ftTip'] as const) {
    const rows = await (prisma[table] as any).findMany({ where: { status: 'VOID', homeScore: { not: null }, awayScore: { not: null } } });
    for (const r of rows) {
      const status = await evaluateStrict(r.market, r.homeTeam, r.awayTeam, r.homeScore, r.awayScore, null, r.pick);
      if (!status) {
        console.log(`${table} ${r.date} ${r.homeTeam}-${r.awayTeam} "${r.pick}" ${r.homeScore}-${r.awayScore}: stays VOID`);
        continue;
      }
      await (prisma[table] as any).update({ where: { id: r.id }, data: { status } });
      console.log(`${table} ${r.date} ${r.homeTeam}-${r.awayTeam} "${r.pick}" ${r.homeScore}-${r.awayScore}: VOID → ${status}`);
      fixed++;
    }
  }
  console.log(`\nRe-settled ${fixed} tip(s).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
