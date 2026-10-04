// scripts/backfill-zulu.ts — npm run backfill:zulu [days=35]
// One-off: loads the last N days of Zulubet picks (with real results) so the history starts full.
// Picks use the same rule as the live scraper, applied to each day's finished list. Idempotent.
import { prisma } from '../src/lib/db/prisma';
import { fetchZulubetDay, selectZuluPicks, zuluRowToTip, outcome } from '../src/lib/scraper/zulubet';

async function main() {
  const days = parseInt(process.argv[2] ?? '35', 10);
  let added = 0;
  for (let i = 1; i <= days; i++) {
    const day = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    let rows;
    try {
      rows = (await fetchZulubetDay(day)).filter((r) => r.kickoffIso.startsWith(day) && r.score);
    } catch {
      continue; // older than the site's retention
    }
    const data = selectZuluPicks(rows).map((r, k) => {
      const tip = zuluRowToTip(r, k + 1);
      const hit = outcome(r.score!) === r.tip;
      return { ...tip, legs: null, status: hit ? 'WIN' : 'LOSS', homeScore: r.score!.homeScore, awayScore: r.score!.awayScore };
    });
    await new Promise((r) => setTimeout(r, 1500)); // be polite to the site
    if (data.length === 0) continue;
    const res = await prisma.extTip.createMany({ data, skipDuplicates: true });
    added += res.count;
    console.log(`${day}: ${data.length} picks, ${res.count} new`);
  }
  console.log(`\nBackfilled ${added} Zulubet picks.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
