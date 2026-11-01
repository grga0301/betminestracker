// One-off: remove FreeSuperTips rows that are the same tip stored again on the next day, and fix the impossible 0.9 odds.
import { prisma } from '../src/lib/db/prisma';

const PAIRS: [number, number][] = [[74, 75], [67, 68], [49, 50], [45, 46], [43, 44], [40, 41], [38, 39], [32, 33], [27, 28], [13, 14]];

(async () => {
  let removed = 0;
  for (const [keepId, dupId] of PAIRS) {
    const [a, b] = await Promise.all([prisma.fstTip.findUnique({ where: { id: keepId } }), prisma.fstTip.findUnique({ where: { id: dupId } })]);
    if (!a || !b) { console.log(`#${keepId}/#${dupId}: missing row — skipped`); continue; }
    const days = (Date.parse(b.date) - Date.parse(a.date)) / 864e5;
    const same = a.homeTeam === b.homeTeam && a.awayTeam === b.awayTeam && a.pick === b.pick && a.market === b.market;
    if (!same || days < 1 || days > 2) { console.log(`#${keepId}/#${dupId}: NOT an identical next-day repeat (${a.date} ${a.pick} vs ${b.date} ${b.pick}) — skipped`); continue; }
    console.log(`DELETE #${dupId} ${JSON.stringify(b)}  (duplicate of #${keepId} ${a.date})`);
    await prisma.fstTip.delete({ where: { id: dupId } });
    removed++;
  }
  const fix = await prisma.fstTip.updateMany({ where: { id: 30, odd: 0.9 }, data: { odd: 1.8 } });
  console.log(`removed ${removed} duplicate(s); #30 odds 0.9 -> 1.8 (${fix.count} row)`);
  await prisma.$disconnect();
})();
