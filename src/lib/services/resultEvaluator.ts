// src/lib/services/resultEvaluator.ts
// Determines WIN/LOSS for each selection based on market type and final score

import type { SelectionStatus } from '../types';

interface EvalInput {
  market: string;
  line: number | null;
  homeScore: number;
  awayScore: number;
}

/**
 * Evaluate whether a single selection won or lost.
 */
export function evaluateSelection(input: EvalInput): SelectionStatus {
  const { market, line, homeScore, awayScore } = input;
  const totalGoals = homeScore + awayScore;
  const marketLower = market.toLowerCase();

  // ─── Over / Under goals ──────────────────────────────────────────────
  if (marketLower.includes('over')) {
    const l = line ?? parseFloat(marketLower.match(/over\s*([\d.]+)/)?.[1] ?? '');
    if (!isNaN(l)) return totalGoals > l ? 'WIN' : 'LOSS';
  }

  if (marketLower.includes('under')) {
    const l = line ?? parseFloat(marketLower.match(/under\s*([\d.]+)/)?.[1] ?? '');
    if (!isNaN(l)) return totalGoals < l ? 'WIN' : 'LOSS';
  }

  // ─── Both Teams To Score (BTTS) ──────────────────────────────────────
  if (marketLower.includes('btts') || marketLower.includes('both teams to score')) {
    const bothScored = homeScore > 0 && awayScore > 0;
    if (marketLower.includes('no') || marketLower.includes('gts - no')) {
      return !bothScored ? 'WIN' : 'LOSS';
    }
    return bothScored ? 'WIN' : 'LOSS';
  }

  // ─── 1X2 (Home / Draw / Away) ────────────────────────────────────────
  if (marketLower === 'home' || marketLower === '1') {
    return homeScore > awayScore ? 'WIN' : 'LOSS';
  }

  if (marketLower === 'draw' || marketLower === 'x') {
    return homeScore === awayScore ? 'WIN' : 'LOSS';
  }

  if (marketLower === 'away' || marketLower === '2') {
    return awayScore > homeScore ? 'WIN' : 'LOSS';
  }

  // ─── Double Chance ────────────────────────────────────────────────────
  if (marketLower === '1x' || marketLower === 'home or draw') {
    return homeScore >= awayScore ? 'WIN' : 'LOSS';
  }

  if (marketLower === '12' || marketLower === 'home or away') {
    return homeScore !== awayScore ? 'WIN' : 'LOSS';
  }

  if (marketLower === 'x2' || marketLower === 'draw or away') {
    return awayScore >= homeScore ? 'WIN' : 'LOSS';
  }

  // ─── Asian Handicap (basic) ──────────────────────────────────────────
  const ahMatch = marketLower.match(/asian handicap\s+([-+]?[\d.]+)/);
  if (ahMatch && line !== null) {
    const handicap = parseFloat(ahMatch[1]);
    const adjustedHome = homeScore + handicap;

    if (marketLower.includes('home')) {
      if (adjustedHome > awayScore) return 'WIN';
      if (adjustedHome === awayScore) return 'VOID';
      return 'LOSS';
    }

    if (marketLower.includes('away')) {
      if (awayScore > adjustedHome) return 'WIN';
      if (awayScore === adjustedHome) return 'VOID';
      return 'LOSS';
    }
  }

  // ─── Total goals exact ───────────────────────────────────────────────
  const exactMatch = marketLower.match(/^(\d+)\+\s*goals?$/);
  if (exactMatch) {
    return totalGoals >= parseInt(exactMatch[1]) ? 'WIN' : 'LOSS';
  }

  console.warn(`[Evaluator] Unknown market: "${market}" — marking VOID`);
  return 'VOID';
}

/**
 * Given an array of selection results, determine the overall double status.
 */
export function evaluateDouble(
  selectionStatuses: SelectionStatus[]
): 'WIN' | 'LOSS' | 'PENDING' | 'VOID' {
  if (selectionStatuses.some((s) => s === 'PENDING')) return 'PENDING';
  if (selectionStatuses.every((s) => s === 'WIN')) return 'WIN';
  if (selectionStatuses.some((s) => s === 'LOSS')) return 'LOSS';
  if (selectionStatuses.every((s) => s === 'VOID')) return 'VOID';
  return 'LOSS'; // Mixed win/void = LOSS in most bookmakers
}
