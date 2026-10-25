// One-off: exercises the Gemini two-vote score fallback on known and unknown matches.
import { fetchScoreWithGemini } from '../src/lib/services/geminiEvaluator';
import { prisma } from '../src/lib/db/prisma';

const cases: [string, string, string][] = [
  ['Raufoss', 'Ranheim', '2026-10-24'], // known: 1-3
  ['Beveren', 'Lommel United', '2026-10-09'], // known: 1-3
  ['SHANGHAI SIPG', 'Chengdu Better City', '2026-10-18'], // unknown so far
];

(async () => {
  for (const [h, a, d] of cases) {
    console.log(`\n=== ${h} vs ${a} ${d}`);
    console.log('RESULT', h, a, JSON.stringify(await fetchScoreWithGemini(h, a, d)));
  }
  await prisma.$disconnect();
})();
