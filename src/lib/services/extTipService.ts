// src/lib/services/extTipService.ts
// DB access for tips from third-party tipster sites (TipOracle, FootyAccumulators, FootballPark).

import { prisma } from '../db/prisma';
import type { ExtLeg, ExtScrapedTip } from '../scraper/tiporacle';

export type ExtSource = 'TIPORACLE' | 'FOOTYACCA' | 'FOOTYACCA_BTTS' | 'FOOTYACCA_OVER25' | 'FOOTBALLPARK' | 'FOOTBALLSUPER' | 'FREETIPS_DOUBLE' | 'ZULUBET';
export const EXT_SOURCES: ExtSource[] = ['TIPORACLE', 'FOOTYACCA', 'FOOTYACCA_BTTS', 'FOOTYACCA_OVER25', 'FOOTBALLPARK', 'FOOTBALLSUPER', 'FREETIPS_DOUBLE', 'ZULUBET'];

export interface ExtTipRecord {
  id: number;
  source: ExtSource;
  date: string;
  rank: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
  market: string;
  pick: string;
  kickoff: string;
  odd: number;
  confidence: number | null;
  legs: ExtLeg[] | null;
  status: 'PENDING' | 'WIN' | 'LOSS' | 'VOID' | 'UNRESOLVED';
  homeScore: number | null;
  awayScore: number | null;
}

export interface ExtStats {
  total: number;
  wins: number;
  losses: number;
  pending: number;
  winRate: number;
  avgOdds: number;
  /** Flat 1u stake on every resolved tip: WIN → odd-1, LOSS → -1. */
  profit: number;
  roi: number;
  currentStreak: number;
  streakType: 'WIN' | 'LOSS' | 'NONE';
}

/** Insert tips that are not stored yet (unique on source+date+rank). Returns how many were new. */
export async function saveExtTips(tips: ExtScrapedTip[]): Promise<number> {
  const data = tips.map(({ legs, ...t }) => ({ ...t, legs: legs ? JSON.stringify(legs) : null }));
  const result = await prisma.extTip.createMany({ data, skipDuplicates: true });
  return result.count;
}

export async function getExtTips(source: ExtSource): Promise<ExtTipRecord[]> {
  const rows = await prisma.extTip.findMany({
    where: { source },
    orderBy: [{ date: 'desc' }, { rank: 'asc' }],
  });
  return rows.map((r) => ({
    id: r.id,
    source: r.source as ExtSource,
    date: r.date,
    rank: r.rank,
    homeTeam: r.homeTeam,
    awayTeam: r.awayTeam,
    league: r.league,
    market: r.market,
    pick: r.pick,
    kickoff: r.kickoff,
    odd: r.odd,
    confidence: r.confidence,
    legs: r.legs ? (JSON.parse(r.legs) as ExtLeg[]) : null,
    status: r.status as ExtTipRecord['status'],
    homeScore: r.homeScore,
    awayScore: r.awayScore,
  }));
}

export function computeExtStats(tips: Pick<ExtTipRecord, 'status' | 'odd'>[]): ExtStats {
  // tips arrive newest first
  const wins = tips.filter((t) => t.status === 'WIN');
  const losses = tips.filter((t) => t.status === 'LOSS');
  const pending = tips.filter((t) => t.status === 'PENDING').length;
  const decided = wins.length + losses.length;
  const profit = wins.reduce((a, t) => a + t.odd - 1, 0) - losses.length;

  const resolved = tips.filter((t) => t.status === 'WIN' || t.status === 'LOSS');
  let currentStreak = 0;
  let streakType: ExtStats['streakType'] = 'NONE';
  if (resolved.length > 0) {
    streakType = resolved[0].status as 'WIN' | 'LOSS';
    for (const t of resolved) {
      if (t.status !== streakType) break;
      currentStreak++;
    }
  }

  return {
    total: tips.length,
    wins: wins.length,
    losses: losses.length,
    pending,
    winRate: decided > 0 ? (wins.length / decided) * 100 : 0,
    avgOdds: tips.length > 0 ? tips.reduce((a, t) => a + t.odd, 0) / tips.length : 0,
    profit,
    roi: decided > 0 ? (profit / decided) * 100 : 0,
    currentStreak,
    streakType,
  };
}

/** Tips (any source, incl. legs-free ones) that already carry a final score — lets other sources reuse it. */
export async function getScoredExtTips(sinceDate: string) {
  return prisma.extTip.findMany({
    where: { date: { gte: sinceDate }, homeScore: { not: null }, awayScore: { not: null } },
    select: { date: true, homeTeam: true, awayTeam: true, homeScore: true, awayScore: true },
  });
}

export async function getPendingExtTips() {
  return prisma.extTip.findMany({
    where: { status: 'PENDING' },
    orderBy: [{ date: 'asc' }, { rank: 'asc' }],
  });
}

export async function updateExtTipResult(
  id: number,
  status: string,
  homeScore: number,
  awayScore: number
) {
  return prisma.extTip.update({ where: { id }, data: { status, homeScore, awayScore } });
}

/** Persist per-leg progress of a multi-match ticket; the ticket status follows from its legs. */
export async function updateExtTipLegs(id: number, status: 'PENDING' | 'WIN' | 'LOSS', legs: ExtLeg[]) {
  return prisma.extTip.update({ where: { id }, data: { status, legs: JSON.stringify(legs) } });
}

/** Subset of `tips` that are not stored yet (unique on source, date, rank) — call before saveExtTips. */
export async function findNewExtTips<T extends { source: string; date: string; rank: number }>(tips: T[]): Promise<T[]> {
  if (tips.length === 0) return [];
  const existing = await prisma.extTip.findMany({
    where: { OR: tips.map((t) => ({ source: t.source, date: t.date, rank: t.rank })) },
    select: { source: true, date: true, rank: true },
  });
  const have = new Set(existing.map((e) => `${e.source}|${e.date}|${e.rank}`));
  return tips.filter((t) => !have.has(`${t.source}|${t.date}|${t.rank}`));
}

/**
 * Drops tips whose match (same source, same teams) is already stored within the last `days` days. For sources that
 * publish no date, this stops a stale pick that is still on the page from being stored again under a new date.
 */
export async function dropRecentRepeats<T extends { source: string; date: string; homeTeam: string; awayTeam: string }>(
  tips: T[],
  days = 2
): Promise<T[]> {
  const out: T[] = [];
  for (const t of tips) {
    const since = new Date(Date.parse(t.date) - days * 864e5).toISOString().slice(0, 10);
    const repeat = await prisma.extTip.findFirst({
      where: { source: t.source, homeTeam: t.homeTeam, awayTeam: t.awayTeam, date: { gte: since, lt: t.date } },
    });
    if (!repeat) out.push(t);
    else console.log(`  (skipping ${t.homeTeam} vs ${t.awayTeam}: already stored on ${repeat.date})`);
  }
  return out;
}
