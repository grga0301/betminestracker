// src/lib/services/fstService.ts
import { prisma } from '../db/prisma';
import type { FstTipRecord } from '../types';

export async function saveFstTip(tip: {
  date: string;
  homeTeam: string;
  awayTeam: string;
  pick: string;
  market: string;
  kickoff: string;
}): Promise<{ saved: boolean; alreadyExists: boolean }> {
  const existing = await prisma.fstTip.findUnique({ where: { date: tip.date } });
  if (existing) return { saved: false, alreadyExists: true };

  await prisma.fstTip.create({ data: tip });
  return { saved: true, alreadyExists: false };
}

export async function getAllFstTips(): Promise<FstTipRecord[]> {
  const rows = await prisma.fstTip.findMany({
    orderBy: { date: 'desc' },
  });
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    homeTeam: r.homeTeam,
    awayTeam: r.awayTeam,
    pick: r.pick,
    market: r.market,
    kickoff: r.kickoff,
    status: r.status as FstTipRecord['status'],
    homeScore: r.homeScore,
    awayScore: r.awayScore,
  }));
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
