import { prisma } from '../db/prisma';
import type { FtScrapedTip } from '../scraper/freetips';

export interface FtTipRecord {
  id: number;
  date: string;
  homeTeam: string;
  awayTeam: string;
  pick: string;
  market: string;
  kickoff: string;
  odd: number;
  status: 'PENDING' | 'WIN' | 'LOSS' | 'VOID';
  homeScore: number | null;
  awayScore: number | null;
}

export interface FtStats {
  total: number;
  wins: number;
  losses: number;
  pending: number;
  winRate: number;
  currentStreak: number;
  streakType: 'WIN' | 'LOSS' | 'NONE';
  avgOdds: number;
}

export async function saveFtTip(
  tip: FtScrapedTip
): Promise<{ saved: boolean; alreadyExists: boolean }> {
  const existing = await prisma.ftTip.findUnique({ where: { date: tip.date } });
  if (existing) return { saved: false, alreadyExists: true };
  await prisma.ftTip.create({ data: tip });
  return { saved: true, alreadyExists: false };
}

export async function getAllFtTips(): Promise<FtTipRecord[]> {
  const rows = await prisma.ftTip.findMany({ orderBy: { date: 'desc' } });
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    homeTeam: r.homeTeam,
    awayTeam: r.awayTeam,
    pick: r.pick,
    market: r.market,
    kickoff: r.kickoff,
    odd: r.odd,
    status: r.status as FtTipRecord['status'],
    homeScore: r.homeScore,
    awayScore: r.awayScore,
  }));
}

export async function getFtStats(): Promise<FtStats> {
  const tips = await prisma.ftTip.findMany({
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

export async function getPendingFtTips() {
  return prisma.ftTip.findMany({ where: { status: 'PENDING' }, orderBy: { date: 'asc' } });
}

export async function updateFtTipResult(
  id: number,
  status: string,
  homeScore: number,
  awayScore: number
) {
  return prisma.ftTip.update({ where: { id }, data: { status, homeScore, awayScore } });
}
