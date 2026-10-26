// scripts/scrape.ts
// Run with: npm run scrape
// Scrapes today's BetMines "Double" (table BetDouble) and "Risk" bet (ExtTip, source BETMINES_RISK) in ONE page fetch.

import { PrismaClient } from '@prisma/client';
import { scrapeBetMinesDaily } from '../src/lib/scraper/betmines';
import type { ScrapedDouble } from '../src/lib/types';
import type { ExtLeg, ExtScrapedTip } from '../src/lib/scraper/tiporacle';

const prisma = new PrismaClient();

const pairs = (xs: { homeTeam: string; awayTeam: string }[]) =>
  xs.map((x) => `${x.homeTeam}|${x.awayTeam}`).sort().join(';');

/** BetMines market wording → the vocabulary of extTipEvaluator. Unknown markets (e.g. handicaps) pass through and stay PENDING. */
function toExtMarket(market: string): string {
  if (market === 'BTTS') return 'BTTS - Yes';
  if (market === 'No BTTS') return 'BTTS - No';
  if (market === 'Home') return 'Home Win';
  if (market === 'Away') return 'Away Win';
  const ou = market.match(/^(Over|Under) (\d+(?:\.\d+)?)$/);
  if (ou) return `${ou[1]} ${ou[2]} Goals`;
  return market;
}

function riskToExtTip(risk: ScrapedDouble): ExtScrapedTip {
  const legs: ExtLeg[] = [...risk.selections]
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
    .map((s) => ({
      homeTeam: s.homeTeam,
      awayTeam: s.awayTeam,
      market: toExtMarket(s.market),
      kickoffIso: s.kickoff,
      status: 'PENDING' as const,
      homeScore: null,
      awayScore: null,
    }));
  const first = legs[0];
  const firstSel = risk.selections.find((s) => s.homeTeam === first.homeTeam && s.awayTeam === first.awayTeam);
  const label = `${legs.length}-fold: ${legs.map((l) => l.market).filter((v, i, a) => a.indexOf(v) === i).join(' / ')}`;
  return {
    source: 'BETMINES_RISK',
    date: risk.date,
    rank: 1,
    homeTeam: first.homeTeam,
    awayTeam: first.awayTeam,
    league: firstSel?.league ?? '',
    market: label,
    pick: label,
    kickoff: first.kickoffIso.slice(11, 16),
    odd: risk.totalOdds,
    confidence: null,
    sourceUrl: 'https://betmines.com/daily-bets-football',
    legs,
  };
}

async function saveDouble(scraped: ScrapedDouble): Promise<void> {
  // Guard: BetMines publishes the new double in the morning; before that the page still shows yesterday's.
  const latest = await prisma.betDouble.findFirst({ orderBy: { date: 'desc' }, include: { selections: true } });
  if (latest && pairs(latest.selections) === pairs(scraped.selections)) {
    console.log(`ℹ Page still shows the previous double (${latest.date}). Not saving; will retry next run.`);
    return;
  }

  const created = await prisma.betDouble.create({
    data: {
      date: scraped.date,
      totalOdds: scraped.totalOdds,
      status: 'PENDING',
      selections: {
        create: scraped.selections.map((s) => ({
          homeTeam: s.homeTeam,
          awayTeam: s.awayTeam,
          market: s.market,
          line: s.line ?? null,
          odd: s.odd,
          league: s.league,
          country: s.country,
          kickoff: s.kickoff,
          resultStatus: 'PENDING',
        })),
      },
    },
    include: { selections: true },
  });

  console.log('✓ Double saved to database!\n');
  console.log(`  ID:         ${created.id}`);
  console.log(`  Date:       ${created.date}`);
  console.log(`  Total Odds: ×${created.totalOdds.toFixed(2)}`);
  console.log(`  Status:     ${created.status}\n`);
  for (const sel of created.selections) {
    console.log(`  📌 ${sel.homeTeam} vs ${sel.awayTeam}`);
    console.log(`     Market: ${sel.market} @ ${sel.odd}`);
    console.log(`     League: ${sel.country} - ${sel.league}\n`);
  }
}

async function saveRisk(scraped: ScrapedDouble): Promise<void> {
  const tip = riskToExtTip(scraped);

  // Same stale-page guard as for the double: yesterday's Risk bet may still be on the page early in the day.
  const latest = await prisma.extTip.findFirst({ where: { source: 'BETMINES_RISK' }, orderBy: { date: 'desc' } });
  if (latest?.legs) {
    const prev = JSON.parse(latest.legs) as ExtLeg[];
    if (pairs(prev) === pairs(tip.legs!)) {
      console.log(`ℹ Page still shows the previous Risk bet (${latest.date}). Not saving; will retry next run.`);
      return;
    }
  }
  // A ticket first seen after its first match started proves nothing (same rule as the other ticket sources).
  if (Date.parse(tip.legs![0].kickoffIso) <= Date.now()) {
    console.log(`ℹ First Risk match already started (${tip.legs![0].kickoffIso}) — not storing today's Risk bet.`);
    return;
  }

  const { legs, ...rest } = tip;
  const res = await prisma.extTip.createMany({ data: [{ ...rest, legs: JSON.stringify(legs) }], skipDuplicates: true });
  console.log(`✓ Risk bet saved (${res.count} new): ${tip.market} @ ${tip.odd}`);
}

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   BetMines Double + Risk - SCRAPER     ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`  Date: ${new Date().toLocaleDateString('en-GB')}\n`);

  try {
    const today = new Date().toISOString().slice(0, 10);
    const existingDouble = await prisma.betDouble.findUnique({ where: { date: today } });
    const existingRisk = await prisma.extTip.findFirst({ where: { source: 'BETMINES_RISK', date: today } });
    const needDouble = !existingDouble;
    const needRisk = !existingRisk;

    if (!needDouble) console.log(`✓ Double for ${today} already in database (id=${existingDouble!.id}, ${existingDouble!.status}).`);
    if (!needRisk) console.log(`✓ Risk bet for ${today} already in database (id=${existingRisk!.id}, ${existingRisk!.status}).`);
    if (!needDouble && !needRisk) process.exit(0);

    // The scraping API costs credits per call (free plan ≈ 1000 requests/month), and BetMines publishes the
    // bets around midnight UTC — so scheduled runs only call it in that window (00-11 UTC, wide because GitHub
    // delays crons by up to ~6h). Manual runs always go.
    const hour = new Date().getUTCHours();
    if (process.env.SCRAPEDO_TOKEN && process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' && hour > 11) {
      console.log(`⏭ ${hour}:00 UTC is outside the 00–11 UTC publish window — skipping to save API credits.`);
      process.exit(0);
    }

    console.log('🔍 Scraping BetMines...\n');
    const { double, risk } = await scrapeBetMinesDaily();

    let failed = false;
    if (needDouble) {
      if (double) await saveDouble(double);
      else {
        console.error('✗ No double found on BetMines today.');
        failed = true;
      }
    }
    if (needRisk) {
      if (risk) await saveRisk(risk);
      else console.error('✗ No Risk bet found on BetMines today.');
    }
    if (failed) process.exit(1);
  } catch (err) {
    console.error('✗ Scrape failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
