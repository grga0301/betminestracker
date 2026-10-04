'use client';

import { useEffect, useState } from 'react';
import type { ExtSource, ExtStats, ExtTipRecord } from '@/lib/services/extTipService';
import { StatusBadge } from './StatusBadge';

interface Props {
  source: ExtSource;
  title: string;
  blurb: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

export function ExtSection({ source, title, blurb }: Props) {
  const [tips, setTips] = useState<ExtTipRecord[]>([]);
  const [stats, setStats] = useState<ExtStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/ext/tips?source=${source}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setTips(d.tips ?? []); setStats(d.stats ?? null); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [source]);

  // Group by day so every date shows its picks together (history stays readable).
  const days = tips.reduce<Record<string, ExtTipRecord[]>>((acc, t) => {
    (acc[t.date] ??= []).push(t);
    return acc;
  }, {});

  const decided = stats ? stats.wins + stats.losses : 0;

  return (
    <section className="mt-12">
      <h2 className="text-xs uppercase tracking-widest text-[var(--chalk-dim)]">{title}</h2>
      <p className="text-[11px] text-[var(--chalk-dim)]/70 mt-1 mb-4">{blurb}</p>

      {stats && stats.total > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Stat
            label="Win Rate"
            value={decided > 0 ? `${stats.winRate.toFixed(1)}%` : '—'}
            sub={`${stats.wins}W / ${stats.losses}L · ${stats.pending} pending`}
            tone={stats.winRate >= 50 ? 'green' : decided > 0 ? 'red' : 'dim'}
          />
          <Stat
            label="Profit (1u)"
            value={decided > 0 ? `${stats.profit >= 0 ? '+' : ''}${stats.profit.toFixed(2)}u` : '—'}
            sub={decided > 0 ? `ROI ${stats.roi.toFixed(1)}%` : 'no resolved tips'}
            tone={stats.profit > 0 ? 'green' : stats.profit < 0 ? 'red' : 'dim'}
          />
          <Stat label="Avg Odds" value={stats.avgOdds.toFixed(2)} sub={`${stats.total} tips`} tone="dim" />
          <Stat
            label="Streak"
            value={stats.currentStreak > 0 ? String(stats.currentStreak) : '—'}
            sub={stats.streakType === 'NONE' ? 'no data yet' : stats.streakType}
            tone={stats.streakType === 'WIN' ? 'green' : stats.streakType === 'LOSS' ? 'red' : 'dim'}
          />
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 rounded-full border-2 border-[var(--accent)]/30 border-t-[var(--accent)] animate-spin" />
        </div>
      )}

      {!loading && tips.length === 0 && (
        <div className="text-center py-10 border border-dashed border-[var(--border)] rounded-xl">
          <p className="text-[var(--chalk-dim)] text-sm">No tips yet — the hourly job fills this in.</p>
        </div>
      )}

      <div className="space-y-4">
        {Object.entries(days).map(([date, list]) => (
          <div key={date} className="card p-4">
            <p className="text-[10px] uppercase tracking-widest text-[var(--chalk-dim)] mb-2">{formatDate(date)}</p>
            <div className="divide-y divide-white/5">
              {list.map((t) => (
                <div key={t.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-[var(--chalk)] truncate">
                      {t.homeTeam} <span className="text-[var(--chalk-dim)]">vs</span> {t.awayTeam}
                    </p>
                    <p className="text-[11px] text-[var(--chalk-dim)] truncate">
                      {t.market}
                      {t.league && ` · ${t.league}`}
                      {t.kickoff && ` · ${t.kickoff}`}
                      {t.confidence != null && ` · ${t.confidence}%`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {t.homeScore !== null && t.awayScore !== null && (
                      <span className="font-mono-data text-xs text-[var(--chalk-dim)]">{t.homeScore}–{t.awayScore}</span>
                    )}
                    <span className="font-mono-data text-sm text-[var(--accent)]">@{t.odd.toFixed(2)}</span>
                    <StatusBadge status={t.status} size="sm" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: 'green' | 'red' | 'dim' }) {
  const color = { green: 'text-green-400', red: 'text-red-400', dim: 'text-[var(--chalk)]' }[tone];
  return (
    <div className="card p-4">
      <p className="text-xs uppercase tracking-widest text-[var(--chalk-dim)] mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-[var(--chalk-dim)] mt-1">{sub}</p>
    </div>
  );
}
