// src/lib/services/dashboardService.ts
// Normalises every tip source into one shape and computes per-source performance.

import { prisma } from '../db/prisma';

export type TipStatus = 'WIN' | 'LOSS' | 'PENDING' | 'VOID';

export interface NormTip {
  date: string; // YYYY-MM-DD
  status: TipStatus;
  odd: number;
}

export interface SourceSummary {
  key: string;
  label: string;
  total: number;
  wins: number;
  losses: number;
  pending: number;
  winRate: number | null;
  /** Flat 1u stake per resolved tip: WIN → odd-1, LOSS → -1. */
  profit: number;
  roi: number | null;
  avgOdds: number;
  currentStreak: { type: 'WIN' | 'LOSS' | 'NONE'; tickets: number; days: number };
  longestLossTickets: number;
  longestLossDays: number;
  longestWinTickets: number;
  /** Oldest → newest resolved results (last 20) for the form strip. */
  form: ('WIN' | 'LOSS')[];
  /** Cumulative profit after each resolved tip, oldest → newest. */
  curve: number[];
  /** Last 30 days vs. the 30 before, win rate in %. */
  last30: { wins: number; losses: number; winRate: number | null };
  firstDate: string | null;
  lastDate: string | null;
}

/** A calendar day counts as lost when it has losses and no wins (VOID/PENDING ignored). */
function dayOutcomes(resolved: NormTip[]): ('WIN' | 'LOSS')[] {
  const byDay = new Map<string, { w: number; l: number }>();
  for (const t of resolved) {
    const d = byDay.get(t.date) ?? { w: 0, l: 0 };
    t.status === 'WIN' ? d.w++ : d.l++;
    byDay.set(t.date, d);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, d]) => (d.w > 0 ? 'WIN' : 'LOSS'));
}

function longestRun<T>(items: T[], value: T): number {
  let best = 0, cur = 0;
  for (const i of items) {
    cur = i === value ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  return best;
}

function trailingRun<T>(items: T[]): { value: T | null; n: number } {
  if (items.length === 0) return { value: null, n: 0 };
  const last = items[items.length - 1];
  let n = 0;
  for (let i = items.length - 1; i >= 0 && items[i] === last; i--) n++;
  return { value: last, n };
}

export function summarize(key: string, label: string, tips: NormTip[], today = new Date()): SourceSummary {
  const sorted = [...tips].sort((a, b) => a.date.localeCompare(b.date));
  const resolved = sorted.filter((t) => t.status === 'WIN' || t.status === 'LOSS');
  const wins = resolved.filter((t) => t.status === 'WIN').length;
  const losses = resolved.length - wins;
  const profit = resolved.reduce((a, t) => a + (t.status === 'WIN' ? t.odd - 1 : -1), 0);

  const results = resolved.map((t) => t.status as 'WIN' | 'LOSS');
  const days = dayOutcomes(resolved);
  const tr = trailingRun(results);
  const trDays = trailingRun(days);

  let running = 0;
  const curve = resolved.map((t) => (running += t.status === 'WIN' ? t.odd - 1 : -1));

  const cut = (n: number) => new Date(today.getTime() - n * 864e5).toISOString().slice(0, 10);
  const recent = resolved.filter((t) => t.date >= cut(30));
  const rw = recent.filter((t) => t.status === 'WIN').length;

  return {
    key,
    label,
    total: tips.length,
    wins,
    losses,
    pending: tips.filter((t) => t.status === 'PENDING').length,
    winRate: resolved.length ? (wins / resolved.length) * 100 : null,
    profit,
    roi: resolved.length ? (profit / resolved.length) * 100 : null,
    avgOdds: tips.length ? tips.reduce((a, t) => a + t.odd, 0) / tips.length : 0,
    currentStreak: {
      type: tr.value ?? 'NONE',
      tickets: tr.n,
      days: tr.value === 'LOSS' || tr.value === 'WIN' ? trDays.n : 0,
    },
    longestLossTickets: longestRun(results, 'LOSS'),
    longestLossDays: longestRun(days, 'LOSS'),
    longestWinTickets: longestRun(results, 'WIN'),
    form: results.slice(-20),
    curve,
    last30: {
      wins: rw,
      losses: recent.length - rw,
      winRate: recent.length ? (rw / recent.length) * 100 : null,
    },
    firstDate: sorted[0]?.date ?? null,
    lastDate: sorted[sorted.length - 1]?.date ?? null,
  };
}

export async function getDashboard(): Promise<SourceSummary[]> {
  const [doubles, fst, ft, ext] = await Promise.all([
    prisma.betDouble.findMany({ select: { date: true, status: true, totalOdds: true } }),
    prisma.fstTip.findMany({ select: { date: true, status: true, odd: true } }),
    prisma.ftTip.findMany({ select: { date: true, status: true, odd: true } }),
    prisma.extTip.findMany({ select: { source: true, date: true, status: true, odd: true } }),
  ]);

  const norm = <T extends { date: string; status: string }>(rows: T[], odd: (r: T) => number): NormTip[] =>
    rows.map((r) => ({ date: r.date, status: r.status as TipStatus, odd: odd(r) }));

  const extBy = (src: string) => norm(ext.filter((e) => e.source === src), (r) => r.odd);

  return [
    summarize('betmines', 'BetMines Double', norm(doubles, (r) => r.totalOdds)),
    summarize('fst', 'FreeSuperTips', norm(fst, (r) => r.odd)),
    summarize('ft', 'FreeTips.com', norm(ft, (r) => r.odd)),
    summarize('tiporacle', 'TipOracle', extBy('TIPORACLE')),
    summarize('footyacca', 'FootyAccumulators · Bet of the Day', extBy('FOOTYACCA')),
    summarize('footyacca-btts', 'FootyAccumulators · BTTS treble', extBy('FOOTYACCA_BTTS')),
    summarize('footyacca-o25', 'FootyAccumulators · Over 2.5 treble', extBy('FOOTYACCA_OVER25')),
    summarize('footballpark', 'FootballPark', extBy('FOOTBALLPARK')),
  ];
}
