// src/lib/services/fstService.ts
import { prisma } from '../db/prisma';
import type { FstTipRecord, FstStats } from '../types';

export async function saveFstTip(tip: {
  date: string;
  homeTeam: string;
  awayTeam: string;
  pick: string;
  market: string;
  kickoff: string;
  odd: number;
}): Promise<{ saved: boolean; alreadyExists: boolean }> {
  const existing = await prisma.fstTip.findUnique({ where: { date: tip.date } });
  if (existing) return { saved: false, alreadyExists: true };

  await prisma.fstTip.create({ data: tip });
  return { saved: true, alreadyExists: false };
}

export async function getAllFstTips(): Promise<FstTipRecord[]> {
  const rows = await prisma.fstTip.findMany({ orderBy: { date: 'desc' } });
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    homeTeam: r.homeTeam,
    awayTeam: r.awayTeam,
    pick: r.pick,
    market: r.market,
    kickoff: r.kickoff,
    odd: r.odd,
    status: r.status as FstTipRecord['status'],
    homeScore: r.homeScore,
    awayScore: r.awayScore,
  }));
}

export async function getFstStats(): Promise<FstStats> {
  const tips = await prisma.fstTip.findMany({
    orderBy: { date: 'asc' },
    select: { status: true, odd: true },
  });

  const total = tips.length;
  const wins = tips.filter((t) => t.status === 'WIN').length;
  const losses = tips.filter((t) => t.status === 'LOSS').length;
  const pending = tips.filter((t) => t.status === 'PENDING').length;
  const winRate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0;
  const avgOdds = total > 0 ? tips.reduce((a, t) => a + t.odd, 0) / total : 0;

  let currentStreak = 0;
  let streakType: 'WIN' | 'LOSS' | 'NONE' = 'NONE';
  const resolved = [...tips].reverse().filter((t) => t.status !== 'PENDING');
  if (resolved.length > 0) {
    streakType = resolved[0].status as 'WIN' | 'LOSS';
    for (const t of resolved) {
      if (t.status === streakType) currentStreak++;
      else break;
    }
  }

  return { total, wins, losses, pending, winRate, currentStreak, streakType, avgOdds };
}

export async function getPendingFstTips() {
  return prisma.fstTip.findMany({ where: { status: 'PENDING' }, orderBy: { date: 'asc' } });
}

export async function updateFstTipResult(
  id: number,
  homeScore: number,
  awayScore: number,
  status: string
) {
  return prisma.fstTip.update({
    where: { id },
    data: { homeScore, awayScore, status },
  });
}
