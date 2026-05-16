// src/lib/services/doubleService.ts
// All database operations for BetDoubles

import { prisma } from '../db/prisma';
import type { ScrapedDouble, DoubleRecord, Stats } from '../types';
import { evaluateSelection, evaluateDouble } from './resultEvaluator';

/**
 * Save a scraped double to the database.
 * Returns null if double for this date already exists (deduplication).
 */
export async function saveDouble(data: ScrapedDouble): Promise<{ id: number } | null> {
  const existing = await prisma.betDouble.findUnique({
    where: { date: data.date },
  });

  if (existing) {
    console.log(`[DB] Double for ${data.date} already exists (id=${existing.id}). Skipping.`);
    return null;
  }

  const created = await prisma.betDouble.create({
    data: {
      date: data.date,
      totalOdds: data.totalOdds,
      status: 'PENDING',
      selections: {
        create: data.selections.map((s) => ({
          homeTeam: s.homeTeam,
          awayTeam: s.awayTeam,
          market: s.market,
          line: s.line ?? null,
          odd: s.odd,
          league: s.league,
          country: s.country,
          kickoff: s.kickoff,
          resultStatus: 'PENDING',
          homeScore: null,
          awayScore: null,
        })),
      },
    },
  });

  console.log(`[DB] Saved double id=${created.id} for date=${data.date}`);
  return { id: created.id };
}

/**
 * Fetch all doubles (newest first) for the UI.
 */
export async function getAllDoubles(): Promise<DoubleRecord[]> {
  const doubles = await prisma.betDouble.findMany({
    orderBy: { date: 'desc' },
    include: { selections: true },
  });

  return doubles.map((d) => ({
    id: d.id,
    date: d.date,
    totalOdds: d.totalOdds,
    status: d.status as any,
    createdAt: d.createdAt.toISOString(),
    selections: d.selections.map((s) => ({
      id: s.id,
      homeTeam: s.homeTeam,
      awayTeam: s.awayTeam,
      market: s.market,
      line: s.line,
      odd: s.odd,
      league: s.league,
      country: s.country,
      kickoff: s.kickoff,
      resultStatus: s.resultStatus as any,
      homeScore: s.homeScore,
      awayScore: s.awayScore,
    })),
  }));
}

/**
 * Load all PENDING doubles that need resolution.
 */
export async function getPendingDoubles() {
  return prisma.betDouble.findMany({
    where: { status: 'PENDING' },
    include: { selections: true },
    orderBy: { date: 'asc' },
  });
}

/**
 * Update a selection with a score and computed status.
 */
export async function updateSelectionResult(
  selectionId: number,
  homeScore: number,
  awayScore: number
) {
  const selection = await prisma.betSelection.findUnique({
    where: { id: selectionId },
  });

  if (!selection) throw new Error(`Selection ${selectionId} not found`);

  const resultStatus = evaluateSelection({
    market: selection.market,
    line: selection.line,
    homeScore,
    awayScore,
  });

  await prisma.betSelection.update({
    where: { id: selectionId },
    data: { homeScore, awayScore, resultStatus },
  });

  return resultStatus;
}

/**
 * After updating selections, re-evaluate the parent double status.
 */
export async function resolveDoubleStatus(doubleId: number): Promise<void> {
  const double = await prisma.betDouble.findUnique({
    where: { id: doubleId },
    include: { selections: true },
  });

  if (!double) return;

  const statuses = double.selections.map((s) => s.resultStatus as any);
  const newStatus = evaluateDouble(statuses);

  if (newStatus !== 'PENDING') {
    await prisma.betDouble.update({
      where: { id: doubleId },
      data: { status: newStatus },
    });
    console.log(`[DB] Double id=${doubleId} resolved → ${newStatus}`);
  }
}

/**
 * Manually set scores on a selection (for manual overrides).
 */
export async function manuallySetScore(
  selectionId: number,
  homeScore: number,
  awayScore: number
): Promise<void> {
  await updateSelectionResult(selectionId, homeScore, awayScore);

  const selection = await prisma.betSelection.findUnique({ where: { id: selectionId } });
  if (selection) await resolveDoubleStatus(selection.doubleId);
}

/**
 * Compute aggregate stats for the stats panel.
 */
export async function getStats(): Promise<Stats> {
  const doubles = await prisma.betDouble.findMany({
    orderBy: { date: 'asc' },
    select: { status: true, totalOdds: true },
  });

  const total = doubles.length;
  const wins = doubles.filter((d) => d.status === 'WIN').length;
  const losses = doubles.filter((d) => d.status === 'LOSS').length;
  const pending = doubles.filter((d) => d.status === 'PENDING').length;
  const winRate = total > 0 ? (wins / (wins + losses)) * 100 : 0;
  const avgOdds = total > 0 ? doubles.reduce((a, d) => a + d.totalOdds, 0) / total : 0;

  // Current streak (from newest resolved)
  let currentStreak = 0;
  let streakType: 'WIN' | 'LOSS' | 'NONE' = 'NONE';

  const resolved = [...doubles].reverse().filter((d) => d.status !== 'PENDING');
  if (resolved.length > 0) {
    streakType = resolved[0].status as 'WIN' | 'LOSS';
    for (const d of resolved) {
      if (d.status === streakType) currentStreak++;
      else break;
    }
  }

  return { total, wins, losses, pending, winRate, currentStreak, streakType, avgOdds };
}
