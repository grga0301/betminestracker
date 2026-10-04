// src/lib/services/extTipService.ts
// DB access for tips from third-party tipster sites (TipOracle, FootyAccumulators, FootballPark).

import { prisma } from '../db/prisma';
import type { ExtScrapedTip } from '../scraper/tiporacle';

export type ExtSource = 'TIPORACLE' | 'FOOTYACCA' | 'FOOTBALLPARK';
export const EXT_SOURCES: ExtSource[] = ['TIPORACLE', 'FOOTYACCA', 'FOOTBALLPARK'];

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
  status: 'PENDING' | 'WIN' | 'LOSS' | 'VOID';
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
  const result = await prisma.extTip.createMany({ data: tips, skipDuplicates: true });
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
