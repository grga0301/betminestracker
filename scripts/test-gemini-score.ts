// One-off: exercises the web-search score fallback on known and previously unknown matches.
import { fetchScoreViaSearch } from '../src/lib/services/searchScoreFetcher';
import { prisma } from '../src/lib/db/prisma';

const cases: [string, string, string][] = [
  ['Raufoss', 'Ranheim', '2026-10-24'], // known: 1-3
  ['SK Beveren', 'Lommel United', '2026-10-09'], // known: 1-3
  ['Farnham Town', 'Braintree Town', '2026-10-24'], // known: 6-0
  ['SHANGHAI SIPG', 'Chengdu Better City', '2026-10-18'], // previously unknown, expected 3-0
  ['Galway United', 'Bohemians', '2026-05-22'], // known: 2-4
  ['Real Madrid', 'Barcelona', '2026-10-20'], // control: not a played pair that day, must NOT resolve
];

(async () => {
  for (const [h, a, d] of cases) {
    console.log(`\n=== ${h} vs ${a} ${d}`);
    console.log('RESULT', h, '-', a, JSON.stringify(await fetchScoreViaSearch(h, a, d)));
  }
  await prisma.$disconnect();
})();
