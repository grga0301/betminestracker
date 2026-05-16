// src/lib/types.ts

export type DoubleStatus = 'PENDING' | 'WIN' | 'LOSS' | 'VOID';
export type SelectionStatus = 'PENDING' | 'WIN' | 'LOSS' | 'VOID';

export interface ScrapedSelection {
  homeTeam: string;
  awayTeam: string;
  market: string;
  line: number | null;
  odd: number;
  league: string;
  country: string;
  kickoff: string;
}

export interface ScrapedDouble {
  date: string; // YYYY-MM-DD
  totalOdds: number;
  selections: ScrapedSelection[];
}

export interface SelectionWithResult extends ScrapedSelection {
  resultStatus: SelectionStatus;
  homeScore: number | null;
  awayScore: number | null;
}

export interface DoubleRecord {
  id: number;
  date: string;
  totalOdds: number;
  status: DoubleStatus;
  createdAt: string;
  selections: {
    id: number;
    homeTeam: string;
    awayTeam: string;
    market: string;
    line: number | null;
    odd: number;
    league: string;
    country: string;
    kickoff: string;
    resultStatus: SelectionStatus;
    homeScore: number | null;
    awayScore: number | null;
  }[];
}

export interface FstTipRecord {
  id: number;
  date: string;
  homeTeam: string;
  awayTeam: string;
  pick: string;
  market: string;
  kickoff: string;
  status: DoubleStatus;
  homeScore: number | null;
  awayScore: number | null;
}

export interface Stats {
  total: number;
  wins: number;
  losses: number;
  pending: number;
  winRate: number;
  currentStreak: number;
  streakType: 'WIN' | 'LOSS' | 'NONE';
  avgOdds: number;
}
