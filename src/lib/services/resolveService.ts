// src/lib/services/resolveService.ts
// Checks pending doubles and updates their results

import { getPendingDoubles, getAllDoubles, updateSelectionResult, resolveDoubleStatus } from './doubleService';
import { scrapeResultsFromDailyPage, scrapeMatchResult } from '../scraper/betmines';

interface ResolveResult {
  doubleId: number;
  date: string;
  selections: {
    selectionId: number;
    homeTeam: string;
    awayTeam: string;
    status: string;
    score: string | null;
  }[];
  doubleStatus: string;
}

type ScoreResult = { homeScore: number; awayScore: number };
type DailyResult = ScoreResult & { homeTeam: string; awayTeam: string };

function normalizeTeam(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function teamsMatch(a: string, b: string): boolean {
  const na = normalizeTeam(a);
  const nb = normalizeTeam(b);
  if (na === nb) return true;
  // Handle short abbreviations like "Man United" vs "Manchester United"
  if (na.length >= 4 && nb.includes(na)) return true;
  if (nb.length >= 4 && na.includes(nb)) return true;
  return false;
}

function findInDailyResults(
  dailyResults: DailyResult[],
  homeTeam: string,
  awayTeam: string
): ScoreResult | null {
  for (const r of dailyResults) {
    if (teamsMatch(r.homeTeam, homeTeam) && teamsMatch(r.awayTeam, awayTeam)) {
      return { homeScore: r.homeScore, awayScore: r.awayScore };
    }
    // Try reversed in case home/away was swapped during initial scrape
    if (teamsMatch(r.homeTeam, awayTeam) && teamsMatch(r.awayTeam, homeTeam)) {
      return { homeScore: r.awayScore, awayScore: r.homeScore };
    }
  }
  return null;
}

/**
 * Main resolver — processes all PENDING doubles.
 * Tries the daily bets page first (single load), falls back to the results page per match.
 */
export async function resolveAllPending(): Promise<ResolveResult[]> {
  const pending = await getPendingDoubles();

  if (pending.length === 0) {
    console.log('[Resolver] No pending doubles to resolve.');
    return [];
  }

  console.log(`[Resolver] Found ${pending.length} pending double(s)`);

  // Single page load to get all available results at once
  console.log('[Resolver] Fetching results from daily bets page...');
  const dailyResults = await scrapeResultsFromDailyPage();
  console.log(`[Resolver] Daily page returned ${dailyResults.length} result(s)`);

  const results: ResolveResult[] = [];

  for (const double of pending) {
    console.log(`[Resolver] Processing double id=${double.id} (${double.date})`);

    const selectionResults = [];

    for (const sel of double.selections) {
      if (sel.resultStatus !== 'PENDING') {
        selectionResults.push({
          selectionId: sel.id,
          homeTeam: sel.homeTeam,
          awayTeam: sel.awayTeam,
          status: sel.resultStatus,
          score: sel.homeScore !== null ? `${sel.homeScore}-${sel.awayScore}` : null,
        });
        continue;
      }

      console.log(`[Resolver] Checking: ${sel.homeTeam} vs ${sel.awayTeam}`);

      // 1. Try daily bets page results (already loaded)
      let scoreResult: ScoreResult | null = findInDailyResults(dailyResults, sel.homeTeam, sel.awayTeam);

      if (scoreResult) {
        console.log(`[Resolver] Found on daily page: ${scoreResult.homeScore}-${scoreResult.awayScore}`);
      } else {
        // 2. Fall back to football-results page
        console.log(`[Resolver] Not on daily page — trying football-results page...`);
        for (let attempt = 1; attempt <= 3; attempt++) {
          scoreResult = await scrapeMatchResult(sel.homeTeam, sel.awayTeam);
          if (scoreResult) break;
          if (attempt < 3) {
            console.log(`[Resolver] Attempt ${attempt} failed, retrying in 2s...`);
            await sleep(2000);
          }
        }
      }

      if (scoreResult) {
        const status = await updateSelectionResult(sel.id, scoreResult.homeScore, scoreResult.awayScore);
        console.log(
          `[Resolver] ${sel.homeTeam} vs ${sel.awayTeam}: ${scoreResult.homeScore}-${scoreResult.awayScore} → ${status}`
        );
        selectionResults.push({
          selectionId: sel.id,
          homeTeam: sel.homeTeam,
          awayTeam: sel.awayTeam,
          status,
          score: `${scoreResult.homeScore}-${scoreResult.awayScore}`,
        });
      } else {
        console.log(`[Resolver] Could not find result for ${sel.homeTeam} vs ${sel.awayTeam} — keeping PENDING`);
        selectionResults.push({
          selectionId: sel.id,
          homeTeam: sel.homeTeam,
          awayTeam: sel.awayTeam,
          status: 'PENDING',
          score: null,
        });
      }
    }

    await resolveDoubleStatus(double.id);
    const all = await getAllDoubles();
    const updated = all.find((d) => d.id === double.id);

    results.push({
      doubleId: double.id,
      date: double.date,
      selections: selectionResults,
      doubleStatus: updated?.status || 'PENDING',
    });
  }

  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
