// One-off: BetMines "Risk" tickets of 7-10 Nov 2026 that the scraper missed (Playwright workflows were broken), entered from the
// user's own BetMines iOS app screen recording. Resolved days get the scores shown in the app; the leg status is computed with
// the shared evaluator and compared with the tick/cross shown in the app. A date that already exists is skipped.
// Kickoff times are not visible for finished matches, so a noon placeholder is stored (those legs are already settled).
import { prisma } from '../src/lib/db/prisma';
import { evaluateExtMarket } from '../src/lib/services/extTipEvaluator';
import type { ExtLeg } from '../src/lib/scraper/tiporacle';

interface L { home: string; away: string; league: string; market: string; odd: number; hs?: number; as?: number; ko?: string }
const TICKETS: { date: string; total: number; appResult: 'WIN' | 'LOSS' | 'PENDING'; legs: L[] }[] = [
  {
    date: '2026-11-07', total: 3.18, appResult: 'WIN',
    legs: [
      { home: 'Alloa Athletic', away: 'Airdrieonians', league: 'Scotland - League One', market: 'Over 2.5 Goals', odd: 1.85, hs: 2, as: 3 },
      { home: 'Dartford', away: 'Eastbourne Borough', league: 'England - Non League Premier: Isthmian', market: 'Over 2.5 Goals', odd: 1.72, hs: 4, as: 1 },
    ],
  },
  {
    date: '2026-11-08', total: 3.6, appResult: 'LOSS',
    legs: [
      { home: 'FC Emmen', away: 'MVV Maastricht', league: 'Netherlands - Eerste Divisie', market: 'Over 2.5 Goals', odd: 1.53, hs: 0, as: 2 },
      { home: 'Manchester United', away: 'Aston Villa', league: 'England - Premier League', market: 'Over 2.5 Goals', odd: 1.57, hs: 4, as: 4 },
      { home: 'TSG Hoffenheim', away: 'Schalke 04', league: 'Germany - Bundesliga', market: 'Over 2.5 Goals', odd: 1.5, hs: 2, as: 1 },
    ],
  },
  {
    date: '2026-11-09', total: 3.33, appResult: 'WIN',
    legs: [
      { home: 'Kafr Qasim', away: 'Hapoel Afula', league: 'Israel - Liga Leumit', market: 'Over 2.5 Goals', odd: 1.85, hs: 1, as: 3 },
      { home: 'Torreense', away: 'União de Leiria', league: 'Portugal - Liga Portugal 2', market: 'Over 2.5 Goals', odd: 1.8, hs: 2, as: 3 },
    ],
  },
  {
    date: '2026-11-10', total: 3.07, appResult: 'PENDING', // still being played when the recording was made
    legs: [
      { home: 'Pamplona', away: 'SD Eibar', league: 'Spain - Copa Del Rey', market: 'Away Win', odd: 1.18, ko: '18:00' },
      { home: 'Millwall U21', away: 'Brighton U21', league: 'England - Premier League Cup', market: 'Over 2.5 Goals', odd: 1.7, ko: '20:00' },
      { home: "Bury Town", away: "Bishop's Stortford", league: 'England - Non League Premier: Southern Central', market: 'Over 2.5 Goals', odd: 1.53, ko: '20:45' },
    ],
  },
];

(async () => {
  for (const t of TICKETS) {
    const existing = await prisma.extTip.findFirst({ where: { source: 'BETMINES_RISK', date: t.date } });
    if (existing) {
      console.log(`${t.date}: already in the database (${existing.status}, @${existing.odd}) — skipped`);
      continue;
    }
    const legs: ExtLeg[] = t.legs.map((l) => {
      const settled = l.hs !== undefined && l.as !== undefined;
      const status = settled ? evaluateExtMarket(l.market, l.hs!, l.as!, l.home, l.away) : null;
      return {
        homeTeam: l.home, awayTeam: l.away, market: l.market,
        kickoffIso: `${t.date}T${l.ko ?? '12:00'}:00.000Z`,
        status: status ?? 'PENDING', homeScore: settled ? l.hs! : null, awayScore: settled ? l.as! : null,
      };
    });
    const status = legs.some((l) => l.status === 'LOSS') ? 'LOSS' : legs.every((l) => l.status === 'WIN') ? 'WIN' : 'PENDING';
    const check = status === t.appResult ? 'matches the app' : `!! DIFFERS from the app (${t.appResult})`;
    const label = `${legs.length}-fold: ${legs.map((l) => l.market).filter((v, i, a) => a.indexOf(v) === i).join(' / ')}`;
    await prisma.extTip.create({
      data: {
        source: 'BETMINES_RISK', date: t.date, rank: 1,
        homeTeam: legs[0].homeTeam, awayTeam: legs[0].awayTeam, league: t.legs[0].league,
        market: label, pick: label, kickoff: legs[0].kickoffIso.slice(11, 16), odd: t.total, confidence: null,
        sourceUrl: 'https://betmines.com/daily-bets-football', status, legs: JSON.stringify(legs),
      },
    });
    console.log(`${t.date}: saved ${label} @${t.total} => ${status} (${check}); legs: ${legs.map((l) => `${l.homeTeam} ${l.homeScore ?? '-'}-${l.awayScore ?? '-'} ${l.status}`).join(' | ')}`);
  }
  await prisma.$disconnect();
})();
