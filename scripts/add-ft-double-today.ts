// One-off: stores today's FreeTips Daily Double although its first match has already started (requested manually).
import { scrapeFreeTipsDoubleToday } from '../src/lib/scraper/freetipsdouble';
import { saveExtTips } from '../src/lib/services/extTipService';
import { prisma } from '../src/lib/db/prisma';

(async () => {
  const tips = await scrapeFreeTipsDoubleToday(true);
  for (const t of tips) console.log(`${t.date} ${t.homeTeam} vs ${t.awayTeam} | ${t.market} @${t.odd} | ${t.legs?.length ?? 1} leg(s)`);
  const added = tips.length ? await saveExtTips(tips) : 0;
  console.log(`saved ${added} new ticket(s)`);
  await prisma.$disconnect();
})();
