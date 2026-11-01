// One-off: FreeSuperTips odds that were stored halved (return / wrong stake). Each fix is guarded by the old value.
import { prisma } from '../src/lib/db/prisma';

const FIXES: [number, number, number][] = [
  [82, 1.05, 2.1], // Trabzonspor - Hearts, Over 3.5 (bet365 11/10)
  [76, 1.1, 2.2], // Heerenveen - Excelsior, Excelsior double chance
  [69, 1.35, 2.7], // Lens - Lyon, Lyon to win (bet365 ~2.90)
  [38, 0.84, 1.68], // Norway - Senegal, Senegal double chance (impossible <1)
  [39, 0.84, 1.68], // same match, stored again the next day
];

(async () => {
  for (const [id, oldOdd, newOdd] of FIXES) {
    const r = await prisma.fstTip.updateMany({ where: { id, odd: oldOdd }, data: { odd: newOdd } });
    console.log(`#${id}: ${oldOdd} -> ${newOdd} (${r.count} row)`);
  }
  await prisma.$disconnect();
})();
