// One-off: SportsAPIPro source on known matches (also exercises the DB cache).
import { fetchScoreFromSportsApiPro } from '../src/lib/services/sportsApiProFetcher';
import { prisma } from '../src/lib/db/prisma';

const cases: [string, string, string][] = [
  ['Farnham Town', 'Braintree Town', '2026-10-24'], // 6-0
  ['Raufoss', 'Ranheim', '2026-10-24'], // 1-3 (same date: must come from cache)
  ['SK Beveren', 'Lommel United', '2026-10-09'], // 1-3
  ['Oriente Petrolero', 'Universitario de Vinto', '2026-10-08'], // 2-0
  ['Real Madrid', 'Barcelona', '2026-10-20'], // control: must be null
];
(async () => {
  for (const [h, a, d] of cases) console.log('RESULT', h, '-', a, d, JSON.stringify(await fetchScoreFromSportsApiPro(h, a, d)));
  const cached = await prisma.scheduleCache.findMany({ select: { date: true, fetchedAt: true } });
  console.log('CACHE', JSON.stringify(cached));
  await prisma.$disconnect();
})();
