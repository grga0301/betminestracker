// src/lib/services/fbService.ts
import { prisma } from '../db/prisma';
import type { FbScrapedTicket } from '../scraper/facebook';

export interface FbTicketRecord {
  id: number;
  date: string;
  totalOdds: number;
  status: 'PENDING' | 'WIN' | 'LOSS';
  selections: {
    id: number;
    kickoff: string;
    homeTeam: string;
    awayTeam: string;
    market: string;
    odd: number;
  }[];
}

export interface FbStats {
  total: number;
  wins: number;
  losses: number;
  pending: number;
  winRate: number;
  currentStreak: number;
  streakType: 'WIN' | 'LOSS' | 'NONE';
  avgOdds: number;
}

function normalizeTeam(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function saveFbTicket(
  ticket: FbScrapedTicket
): Promise<{ saved: boolean; alreadyExists: boolean }> {
  // Check by date first
  const existing = await prisma.fbTicket.findUnique({ where: { date: ticket.date } });
  if (existing) return { saved: false, alreadyExists: true };

  // Check if same team pairs exist in any recent ticket (last 3 days)
  // Prevents saving yesterday's ticket again when FB shows it as most recent
  const recentDate = new Date();
  recentDate.setDate(recentDate.getDate() - 3);
  const recentTickets = await prisma.fbTicket.findMany({
    where: { date: { gte: recentDate.toISOString().split('T')[0] } },
    include: { selections: true },
  });

  const incomingPairs = ticket.selections
    .map((s) => `${normalizeTeam(s.homeTeam)}-${normalizeTeam(s.awayTeam)}`);

  for (const recent of recentTickets) {
    const existingPairs = recent.selections
      .map((s) => `${normalizeTeam(s.homeTeam)}-${normalizeTeam(s.awayTeam)}`);
    const matchCount = incomingPairs.filter((p) => existingPairs.includes(p)).length;
    if (matchCount >= 2) return { saved: false, alreadyExists: true };
  }

  await prisma.fbTicket.create({
    data: {
      date: ticket.date,
      postId: ticket.postId,
      totalOdds: ticket.totalOdds,
      status: 'PENDING',
      selections: {
        create: ticket.selections.map((s) => ({
          kickoff: s.kickoff,
          homeTeam: s.homeTeam,
          awayTeam: s.awayTeam,
          market: s.market,
          odd: s.odd,
        })),
      },
    },
  });

  return { saved: true, alreadyExists: false };
}

export async function resolveFbTicket(date: string, status: 'WIN' | 'LOSS'): Promise<boolean> {
  const ticket = await prisma.fbTicket.findUnique({ where: { date } });
  if (!ticket || ticket.status !== 'PENDING') return false;
  await prisma.fbTicket.update({ where: { date }, data: { status } });
  return true;
}

export async function getAllFbTickets(): Promise<FbTicketRecord[]> {
  const rows = await prisma.fbTicket.findMany({
    orderBy: { date: 'desc' },
    include: { selections: true },
  });
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    totalOdds: r.totalOdds,
    status: r.status as FbTicketRecord['status'],
    selections: r.selections.map((s) => ({
      id: s.id,
      kickoff: s.kickoff,
      homeTeam: s.homeTeam,
      awayTeam: s.awayTeam,
      market: s.market,
      odd: s.odd,
    })),
  }));
}

export async function getFbStats(): Promise<FbStats> {
  const tickets = await prisma.fbTicket.findMany({
    orderBy: { date: 'asc' },
    select: { status: true, totalOdds: true },
  });

  const total = tickets.length;
  const wins = tickets.filter((t) => t.status === 'WIN').length;
  const losses = tickets.filter((t) => t.status === 'LOSS').length;
  const pending = tickets.filter((t) => t.status === 'PENDING').length;
  const winRate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0;
  const avgOdds = total > 0 ? tickets.reduce((a, t) => a + t.totalOdds, 0) / total : 0;

  let currentStreak = 0;
  let streakType: 'WIN' | 'LOSS' | 'NONE' = 'NONE';
  const resolved = [...tickets].reverse().filter((t) => t.status !== 'PENDING');
  if (resolved.length > 0) {
    streakType = resolved[0].status as 'WIN' | 'LOSS';
    for (const t of resolved) {
      if (t.status === streakType) currentStreak++;
      else break;
    }
  }

  return { total, wins, losses, pending, winRate, currentStreak, streakType, avgOdds };
}

export async function getPendingFbTickets() {
  return prisma.fbTicket.findMany({ where: { status: 'PENDING' }, orderBy: { date: 'asc' } });
}
