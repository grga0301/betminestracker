// One-off: BetMines Doubles of 7-9 Nov 2026 that the scraper missed (Playwright workflows were broken), entered from the
// user's own BetMines iOS app screenshots. Skips a date that already exists. Kickoff times are not visible on the
// screenshots, so a noon placeholder is stored (all selections are already settled, the resolver never touches them).
import { prisma } from '../src/lib/db/prisma';
import { evaluateSelection, evaluateDouble } from '../src/lib/services/resultEvaluator';

interface Sel { home: string; away: string; league: string; country: string; market: string; line: number | null; odd: number; hs: number; as: number }
const DOUBLES: { date: string; totalOdds: number; sels: Sel[] }[] = [
  {
    date: '2026-11-07', totalOdds: 1.99,
    sels: [
      { home: 'Workington', away: 'Ashton United', league: 'England - Non League Premier: Northern', country: 'England', market: 'Over 2.5', line: 2.5, odd: 1.53, hs: 0, as: 1 },
      { home: 'Roma', away: 'Sassuolo', league: 'Italy - Serie A', country: 'Italy', market: 'Home', line: null, odd: 1.3, hs: 3, as: 0 },
    ],
  },
  {
    date: '2026-11-08', totalOdds: 1.91,
    sels: [
      { home: 'Lech Poznań', away: 'Zagłębie Lubin', league: 'Poland - Ekstraklasa', country: 'Poland', market: 'Over 2.5', line: 2.5, odd: 1.53, hs: 2, as: 2 },
      { home: 'Fiorentina', away: 'Juventus', league: 'Italy - Serie A', country: 'Italy', market: 'Over 1.5', line: 1.5, odd: 1.25, hs: 2, as: 2 },
    ],
  },
  {
    date: '2026-11-09', totalOdds: 2.0,
    sels: [
      { home: 'Sabadell', away: 'Real Sociedad II', league: 'Spain - La Liga 2', country: 'Spain', market: 'Over 1.5', line: 1.5, odd: 1.33, hs: 0, as: 0 },
      { home: 'Redditch United', away: 'Peterborough Sports', league: 'England - Non League Premier: Southern Central', country: 'England', market: 'Over 2.5', line: 2.5, odd: 1.5, hs: 0, as: 1 },
    ],
  },
];

(async () => {
  for (const d of DOUBLES) {
    if (await prisma.betDouble.findUnique({ where: { date: d.date } })) {
      console.log(`${d.date}: already in the database — skipped`);
      continue;
    }
    const sels = d.sels.map((s) => ({ ...s, status: evaluateSelection({ market: s.market, line: s.line, homeScore: s.hs, awayScore: s.as }) }));
    const status = evaluateDouble(sels.map((s) => s.status));
    await prisma.betDouble.create({
      data: {
        date: d.date,
        totalOdds: d.totalOdds,
        status,
        selections: {
          create: sels.map((s) => ({
            homeTeam: s.home, awayTeam: s.away, market: s.market, line: s.line, odd: s.odd, league: s.league, country: s.country,
            kickoff: `${d.date}T12:00:00.000Z`, resultStatus: s.status, homeScore: s.hs, awayScore: s.as,
          })),
        },
      },
    });
    console.log(`${d.date}: saved, ${sels.map((s) => `${s.home} ${s.hs}-${s.as} ${s.away} ${s.market} -> ${s.status}`).join(' | ')} => double ${status}`);
  }
  await prisma.$disconnect();
})();
