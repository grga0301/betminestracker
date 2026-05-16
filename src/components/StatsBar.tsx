// src/components/StatsBar.tsx
'use client';

import type { Stats } from '@/lib/types';

interface Props {
  stats: Stats;
}

export function StatsBar({ stats }: Props) {
  const total = stats?.total ?? 0;
  const wins = stats?.wins ?? 0;
  const losses = stats?.losses ?? 0;
  const pending = stats?.pending ?? 0;
  const winRate = stats?.winRate ?? 0;
  const currentStreak = stats?.currentStreak ?? 0;
  const streakType = stats?.streakType ?? 'NONE';
  const avgOdds = stats?.avgOdds ?? 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
      <StatCard
        label="Win Rate"
        value={total > 0 ? `${winRate.toFixed(1)}%` : '—'}
        sub={`${wins}W / ${losses}L`}
        accent={winRate >= 50 ? 'green' : winRate > 0 ? 'red' : 'dim'}
      />
      <StatCard
        label="Total Doubles"
        value={String(total)}
        sub={`${pending} pending`}
        accent="dim"
      />
      <StatCard
        label="Current Streak"
        value={currentStreak > 0 ? `${currentStreak}` : '—'}
        sub={
          streakType !== 'NONE'
            ? `${streakType === 'WIN' ? '🟢' : '🔴'} ${streakType}`
            : 'No data yet'
        }
        accent={streakType === 'WIN' ? 'green' : streakType === 'LOSS' ? 'red' : 'dim'}
      />
      <StatCard
        label="Avg Odds"
        value={total > 0 ? avgOdds.toFixed(2) : '—'}
        sub="per double"
        accent="dim"
        mono
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
  mono,
}: {
  label: string;
  value: string;
  sub: string;
  accent: 'green' | 'red' | 'dim';
  mono?: boolean;
}) {
  const accentClass = {
    green: 'text-green-400',
    red: 'text-red-400',
    dim: 'text-[var(--chalk)]',
  }[accent];

  return (
    <div className="card p-4">
      <p className="text-xs uppercase tracking-widest text-[var(--chalk-dim)] mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accentClass} ${mono ? 'font-mono-data' : ''}`}>
        {value}
      </p>
      <p className="text-xs text-[var(--chalk-dim)] mt-1">{sub}</p>
    </div>
  );
}
