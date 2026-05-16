// scripts/resolve-fst.ts
// Run with: npm run resolve:fst
import { getPendingFstTips, updateFstTipResult, getAllFstTips } from '../src/lib/services/fstService';
import { fetchScoreFromSportsDB } from '../src/lib/services/fstResultFetcher';
import { scrapeResultsFromDailyPage, scrapeMatchResult } from '../src/lib/scraper/betmines';
import { evaluateSelection } from '../src/lib/services/resultEvaluator';

function normalizeTeam(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findInDailyResults(
  daily: { homeTeam: string; awayTeam: string; homeScore: number; awayScore: number }[],
  homeTeam: string,
  awayTeam: string
): { homeScore: number; awayScore: number } | null {
  const nh = normalizeTeam(homeTeam);
  const na = normalizeTeam(awayTeam);
  for (const r of daily) {
    const rh = normalizeTeam(r.homeTeam);
    const ra = normalizeTeam(r.awayTeam);
    const hm = rh === nh || rh.includes(nh) || nh.includes(rh);
    const am = ra === na || ra.includes(na) || na.includes(ra);
    if (hm && am) return { homeScore: r.homeScore, awayScore: r.awayScore };
    // reversed
    const rhm = rh === na || rh.includes(na) || na.includes(rh);
    const ram = ra === nh || ra.includes(nh) || nh.includes(ra);
    if (rhm && ram) return { homeScore: r.awayScore, awayScore: r.homeScore };
  }
  return null;
}

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║  FreeSuperTips Bet of Day - RESOLVER   ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`  Date: ${new Date().toLocaleDateString('en-GB')}\n`);

  const pending = await getPendingFstTips();

  if (pending.length === 0) {
    console.log('✓ No pending FST tips. All done!\n');
    process.exit(0);
  }

  console.log(`Found ${pending.length} pending FST tip(s)\n`);

  // Load betmines daily results as secondary fallback
  console.log('  📡 Fetching betmines daily results for fallback...');
  let dailyResults: { homeTeam: string; awayTeam: string; homeScore: number; awayScore: number }[] = [];
  try {
    dailyResults = await scrapeResultsFromDailyPage();
    console.log(`  ✓ Loaded ${dailyResults.length} betmines result(s)\n`);
  } catch {
    console.log('  ⚠ Could not load betmines daily results\n');
  }

  for (const tip of pending) {
    console.log(`─── FST Tip ${tip.date}: ${tip.homeTeam} vs ${tip.awayTeam} ───`);
    console.log(`    Pick: ${tip.pick} | Market: ${tip.market}`);

    let score: { homeScore: number; awayScore: number } | null = null;

    // 1. Try TheSportsDB
    console.log('  🔍 Trying TheSportsDB...');
    score = await fetchScoreFromSportsDB(tip.homeTeam, tip.awayTeam, tip.date);
    if (score) {
      console.log(`  ✓ TheSportsDB: ${score.homeScore}-${score.awayScore}`);
    } else {
      // 2. Fallback: betmines daily page
      console.log('  🔍 Trying betmines daily page...');
      score = findInDailyResults(dailyResults, tip.homeTeam, tip.awayTeam);
      if (score) {
        console.log(`  ✓ Betmines: ${score.homeScore}-${score.awayScore}`);
      }
    }

    if (!score) {
      // 3. Final fallback: betmines football-results page (comprehensive)
      console.log('  🔍 Trying betmines football-results...');
      for (let attempt = 1; attempt <= 3; attempt++) {
        score = await scrapeMatchResult(tip.homeTeam, tip.awayTeam);
        if (score) break;
        if (attempt < 3) await new Promise((r) => setTimeout(r, 3000));
      }
      if (score) {
        console.log(`  ✓ Betmines football-results: ${score.homeScore}-${score.awayScore}`);
      }
    }

    if (!score) {
      console.log('  ⏳ Result not found — keeping PENDING\n');
      continue;
    }

    const status = evaluateSelection({
      market: tip.market,
      line: null,
      homeScore: score.homeScore,
      awayScore: score.awayScore,
    });

    await updateFstTipResult(tip.id, score.homeScore, score.awayScore, status);

    const icon = status === 'WIN' ? '🟢' : status === 'LOSS' ? '🔴' : '⚫';
    console.log(`  ${icon} Result: ${score.homeScore}-${score.awayScore} → ${status}\n`);
  }

  // Summary
  const all = await getAllFstTips();
  const wins = all.filter((t) => t.status === 'WIN').length;
  const losses = all.filter((t) => t.status === 'LOSS').length;
  const stillPending = all.filter((t) => t.status === 'PENDING').length;

  console.log('─────────────────────────────────────────');
  console.log(`FST Summary: ${wins}W / ${losses}L / ${stillPending} pending`);
  if (wins + losses > 0) {
    const wr = ((wins / (wins + losses)) * 100).toFixed(1);
    console.log(`Win rate: ${wr}%`);
  }
}

main().catch((err) => {
  console.error('✗ resolve-fst failed:', err);
  process.exit(1);
});
