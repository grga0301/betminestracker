import { fetchScoreFromLiveFootballApi } from '../src/lib/services/liveFootballApiFetcher';
import { prisma } from '../src/lib/db/prisma';
const cases: [string, string, string][] = [
  ['Oriente Petrolero', 'Universitario de Vinto', '2026-10-08'], // 2-0
  ['FAS', 'Alianza', '2026-10-08'], // 2-1
  ['Al Okhdood', 'Al Ula', '2026-10-08'], // 1-5
  ['Raufoss', 'Ranheim', '2026-10-24'], // 1-3
  ['Farnham Town', 'Braintree Town', '2026-10-24'], // 6-0
  ['Hibernian', 'Celtic', '2026-10-24'], // provider says "live": must NOT resolve
  ['Real Madrid', 'Barcelona', '2026-10-24'], // control: no such match -> null
];
(async () => {
  for (const [h, a, d] of cases) console.log('RESULT', h, '-', a, d, JSON.stringify(await fetchScoreFromLiveFootballApi(h, a, d)));
  console.log('CACHE', JSON.stringify((await prisma.scheduleCache.findMany({ select: { date: true } })).map((r) => r.date)));
  await prisma.$disconnect();
})();
