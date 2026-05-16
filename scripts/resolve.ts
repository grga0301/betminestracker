// scripts/resolve.ts
// Run with: npm run resolve
// Checks pending doubles and updates results

import { PrismaClient } from '@prisma/client';
import { scrapeResultsFromDailyPage, scrapeMatchResult } from '../src/lib/scraper/betmines';
import { evaluateSelection, evaluateDouble } from '../src/lib/services/resultEvaluator';

type DailyResult = { homeTeam: string; awayTeam: string; homeScore: number; awayScore: number };

function normalizeTeam(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findScore(daily: DailyResult[], home: string, away: string): { homeScore: number; awayScore: number } | null {
  const nh = normalizeTeam(home);
  const na = normalizeTeam(away);
  for (const r of daily) {
    const rh = normalizeTeam(r.homeTeam);
    const ra = normalizeTeam(r.awayTeam);
    const homeMatch = rh === nh || rh.includes(nh) || nh.includes(rh);
    const awayMatch = ra === na || ra.includes(na) || na.includes(ra);
    if (homeMatch && awayMatch) return { homeScore: r.homeScore, awayScore: r.awayScore };
    // Also try reversed
    const revHomeMatch = rh === na || rh.includes(na) || na.includes(rh);
    const revAwayMatch = ra === nh || ra.includes(nh) || nh.includes(ra);
    if (revHomeMatch && revAwayMatch) return { homeScore: r.awayScore, awayScore: r.homeScore };
  }
  return null;
}

const prisma = new PrismaClient();

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   BetMines Double Tracker - RESOLVER   ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`  Date: ${new Date().toLocaleDateString('en-GB')}\n`);

  try {
    const pending = await prisma.betDouble.findMany({
      where: { status: 'PENDING' },
      include: { selections: true },
      orderBy: { date: 'asc' },
    });

    if (pending.length === 0) {
      console.log('✓ No pending doubles. All done!\n');
      process.exit(0);
    }

    console.log(`Found ${pending.length} pending double(s)\n`);

    // Load today's results from daily page once (single browser session)
    console.log('  📡 Fetching results from betmines daily page...');
    const dailyResults = await scrapeResultsFromDailyPage();
    console.log(`  ✓ Found ${dailyResults.length} result(s) on daily page\n`);

    for (const double of pending) {
      console.log(`─── Double ${double.id} (${double.date}) ───`);

      for (const sel of double.selections) {
        if (sel.resultStatus !== 'PENDING') {
          console.log(`  ✓ ${sel.homeTeam} vs ${sel.awayTeam} → already ${sel.resultStatus}`);
          continue;
        }

        console.log(`  🔍 Checking: ${sel.homeTeam} vs ${sel.awayTeam}...`);

        let score: { homeScore: number; awayScore: number } | null = null;

        // 1. Try daily page results first
        score = findScore(dailyResults, sel.homeTeam, sel.awayTeam);
        if (score) {
          console.log(`     ✓ Found on daily page: ${score.homeScore}-${score.awayScore}`);
        } else {
          // 2. Fallback: scrape football-results page
          console.log(`     Not on daily page, trying football-results...`);
          for (let attempt = 1; attempt <= 3; attempt++) {
            score = await scrapeMatchResult(sel.homeTeam, sel.awayTeam);
            if (score) break;
            if (attempt < 3) {
              console.log(`     Attempt ${attempt} failed, retrying in 3s...`);
              await sleep(3000);
            }
          }
        }

        if (!score) {
          console.log(`  ⏳ Result not found — keeping PENDING`);
          continue;
        }

        const resultStatus = evaluateSelection({
          market: sel.market,
          line: sel.line,
          homeScore: score.homeScore,
          awayScore: score.awayScore,
        });

        await prisma.betSelection.update({
          where: { id: sel.id },
          data: {
            homeScore: score.homeScore,
            awayScore: score.awayScore,
            resultStatus,
          },
        });

        const icon = resultStatus === 'WIN' ? '🟢' : resultStatus === 'LOSS' ? '🔴' : '⚫';
        console.log(
          `  ${icon} ${sel.homeTeam} vs ${sel.awayTeam}: ` +
          `${score.homeScore}-${score.awayScore} → ${resultStatus}`
        );
        console.log(`     Market: ${sel.market}`);
      }

      // Re-evaluate double
      const updatedSelections = await prisma.betSelection.findMany({
        where: { doubleId: double.id },
      });

      const statuses = updatedSelections.map((s) => s.resultStatus as any);
      const newStatus = evaluateDouble(statuses);

      if (newStatus !== 'PENDING') {
        await prisma.betDouble.update({
          where: { id: double.id },
          data: { status: newStatus },
        });

        const icon = newStatus === 'WIN' ? '🏆' : '❌';
        console.log(`\n  ${icon} Double ${double.id} → ${newStatus} (×${double.totalOdds.toFixed(2)})\n`);
      } else {
        console.log(`\n  ⏳ Double ${double.id} still PENDING\n`);
      }
    }

    // Summary
    const allDoubles = await prisma.betDouble.findMany({
      select: { status: true },
    });
    const wins = allDoubles.filter((d) => d.status === 'WIN').length;
    const losses = allDoubles.filter((d) => d.status === 'LOSS').length;
    const stillPending = allDoubles.filter((d) => d.status === 'PENDING').length;

    console.log('─────────────────────────────────────────');
    console.log(`Summary: ${wins}W / ${losses}L / ${stillPending} pending`);
    if (wins + losses > 0) {
      const wr = ((wins / (wins + losses)) * 100).toFixed(1);
      console.log(`Win rate: ${wr}%`);
    }
    console.log('\n  Open http://localhost:3000 to view updated results');
  } catch (err) {
    console.error('✗ Resolve failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
