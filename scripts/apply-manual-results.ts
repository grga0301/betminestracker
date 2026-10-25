// One-off: applies manually researched final scores to every still-PENDING tip / ticket leg / double selection
// that involves the match. Matching is by team-name fragments (home first, away second), only PENDING rows are touched.
// Run via the "Apply Manual Results" workflow (needs DATABASE_URL).
import { prisma } from '../src/lib/db/prisma';
import { evaluateStrict } from '../src/lib/services/geminiEvaluator';
import { evaluateSelection, evaluateDouble } from '../src/lib/services/resultEvaluator';
import { evaluateExtMarket } from '../src/lib/services/extTipEvaluator';
import type { ExtLeg } from '../src/lib/scraper/tiporacle';

interface Result {
  home: string; // fragment of the home team name
  away: string; // fragment of the away team name
  hs: number;
  as: number;
}

// Sources: ChatGPT + Gemini answers agreeing (Oriente Petrolero–Vinto also confirmed by a web search).
// Shanghai SIPG–Chengdu is intentionally missing: only one unverified source.
const RESULTS: Result[] = [
  { home: 'Galway', away: 'Bohem', hs: 2, as: 4 },
  { home: 'Caracas', away: 'Yaracuyanos', hs: 1, as: 0 },
  { home: 'Forge', away: 'Pacific', hs: 3, as: 0 },
  { home: 'Internacional', away: 'Corinthians', hs: 2, as: 1 },
  { home: 'Okhdood', away: 'Ula', hs: 1, as: 5 },
  { home: 'FAS', away: 'Alianza', hs: 2, as: 1 },
  { home: 'Oriente Petrolero', away: 'Vinto', hs: 2, as: 0 },
  { home: 'Beveren', away: 'Lommel', hs: 1, as: 3 },
  { home: 'Jagiellonia', away: 'Ararat', hs: 3, as: 1 },
  { home: 'Masr', away: 'Azam', hs: 1, as: 1 },
  { home: 'gladbach', away: 'Hoffenheim', hs: 1, as: 2 },
  { home: 'Raufoss', away: 'Ranheim', hs: 1, as: 3 },
  { home: 'Farnham', away: 'Braintree', hs: 6, as: 0 },
];

const has = (name: string, frag: string) => name.toLowerCase().includes(frag.toLowerCase());
const isMatch = (r: Result, home: string, away: string) => has(home, r.home) && has(away, r.away);

async function main() {
  let applied = 0;
  for (const r of RESULTS) {
    const label = `${r.home} ${r.hs}-${r.as} ${r.away}`;
    let hits = 0;

    // BetMines selections (and their doubles)
    for (const s of await prisma.betSelection.findMany({ where: { resultStatus: 'PENDING' } })) {
      if (!isMatch(r, s.homeTeam, s.awayTeam)) continue;
      const status = evaluateSelection({ market: s.market, line: s.line, homeScore: r.hs, awayScore: r.as });
      if (status !== 'WIN' && status !== 'LOSS') continue;
      await prisma.betSelection.update({ where: { id: s.id }, data: { homeScore: r.hs, awayScore: r.as, resultStatus: status } });
      const all = await prisma.betSelection.findMany({ where: { doubleId: s.doubleId } });
      const doubleStatus = evaluateDouble(all.map((x) => x.resultStatus as any));
      await prisma.betDouble.update({ where: { id: s.doubleId }, data: { status: doubleStatus } });
      console.log(`BetMines  ${label}: ${s.market} → ${status} (double ${doubleStatus})`);
      hits++;
    }

    // FST / FreeTips
    for (const [name, model] of [['FST', prisma.fstTip], ['FT', prisma.ftTip]] as const) {
      for (const t of await (model as any).findMany({ where: { status: 'PENDING' } })) {
        if (!isMatch(r, t.homeTeam, t.awayTeam)) continue;
        const status = await evaluateStrict(t.market, t.homeTeam, t.awayTeam, r.hs, r.as, null, t.pick);
        if (!status) continue;
        await (model as any).update({ where: { id: t.id }, data: { status, homeScore: r.hs, awayScore: r.as } });
        console.log(`${name.padEnd(9)} ${label}: ${t.pick} → ${status}`);
        hits++;
      }
    }

    // External tips: single tips and legs of tickets
    for (const t of await prisma.extTip.findMany({ where: { status: 'PENDING' } })) {
      if (!t.legs) {
        if (!isMatch(r, t.homeTeam, t.awayTeam)) continue;
        const status = evaluateExtMarket(t.market, r.hs, r.as, t.homeTeam, t.awayTeam);
        if (!status) continue;
        await prisma.extTip.update({ where: { id: t.id }, data: { status, homeScore: r.hs, awayScore: r.as } });
        console.log(`${t.source.padEnd(9)} ${label}: ${t.market} → ${status}`);
        hits++;
        continue;
      }
      const legs = JSON.parse(t.legs) as ExtLeg[];
      let changed = false;
      legs.forEach((l, i) => {
        if (l.status !== 'PENDING' || !isMatch(r, l.homeTeam, l.awayTeam)) return;
        const status = evaluateExtMarket(l.market, r.hs, r.as, l.homeTeam, l.awayTeam);
        if (!status) return;
        legs[i] = { ...l, status, homeScore: r.hs, awayScore: r.as };
        console.log(`${t.source.padEnd(9)} ${label}: leg ${l.market} → ${status}`);
        changed = true;
        hits++;
      });
      if (changed) {
        const ticket = legs.some((x) => x.status === 'LOSS') ? 'LOSS' : legs.every((x) => x.status === 'WIN') ? 'WIN' : 'PENDING';
        await prisma.extTip.update({ where: { id: t.id }, data: { status: ticket, legs: JSON.stringify(legs) } });
        console.log(`          ticket ${t.id} → ${ticket}`);
      }
    }

    if (hits === 0) console.log(`(nothing pending for ${label})`);
    applied += hits;
  }
  console.log(`\nDone: ${applied} update(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
