// One-off: correct legs of FreeTips Daily Double tickets stored with the old (wrong) market mapping.
import { prisma } from '../src/lib/db/prisma';
import type { ExtLeg } from '../src/lib/scraper/tiporacle';

(async () => {
  const tips = await prisma.extTip.findMany({ where: { source: 'FREETIPS_DOUBLE' } });
  for (const t of tips) {
    if (!t.legs) continue;
    const legs = JSON.parse(t.legs) as ExtLeg[];
    let changed = false;
    for (const l of legs) {
      let m = l.market;
      if (/^Roma$/i.test(l.homeTeam) && /Cagliari/i.test(l.awayTeam) && m === 'Home Win') m = 'Home -1'; // was "Roma (-1)" handicap
      if (/Werder Bremen/i.test(l.homeTeam) && m === 'Alternative Total Goals: Over') m = 'Over 3.5 Goals'; // line from the reason text
      m = m.replace(/^Full Time Result: /, '');
      if (m !== l.market) {
        console.log(`ticket ${t.id} (${t.date}): "${l.market}" -> "${m}" (${l.homeTeam} - ${l.awayTeam})`);
        l.market = m;
        changed = true;
      }
    }
    if (changed) {
      const label = `${legs.length}-fold: ${legs.map((l) => l.market).filter((v, i, a) => a.indexOf(v) === i).join(' / ')}`;
      await prisma.extTip.update({ where: { id: t.id }, data: { legs: JSON.stringify(legs), market: label, pick: label } });
      console.log(`  -> ${label}`);
    }
  }
  await prisma.$disconnect();
})();
