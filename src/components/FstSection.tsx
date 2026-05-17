// src/components/FstSection.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import type { FstTipRecord, FstStats } from '@/lib/types';
import { FstCard } from './FstCard';

const DEFAULT_STATS: FstStats = {
  total: 0, wins: 0, losses: 0, pending: 0,
  winRate: 0, currentStreak: 0, streakType: 'NONE', avgOdds: 0,
};

export function FstSection() {
  const [tips, setTips] = useState<FstTipRecord[]>([]);
  const [stats, setStats] = useState<FstStats>(DEFAULT_STATS);
  const [loading, setLoading] = useState(true);
  const [scrapingFst, setScrapingFst] = useState(false);
  const [resolvingFst, setResolvingFst] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const fetchTips = useCallback(async () => {
    try {
      const res = await fetch('/api/fst/tips');
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      setTips(data.tips ?? []);
      setStats(data.stats ?? DEFAULT_STATS);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTips(); }, [fetchTips]);

  async function handleScrapeFst() {
    setScrapingFst(true);
    setMsg(null);
    try {
      const res = await fetch('/api/fst/scrape', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setMsg({
          text: data.alreadyExists
            ? `ℹ Already scraped FST for ${data.date}`
            : `✓ Saved: ${data.homeTeam} vs ${data.awayTeam} | ${data.market} @${data.odd?.toFixed(2)}`,
          type: data.alreadyExists ? 'info' : 'success',
        });
        fetchTips();
      } else {
        setMsg({ text: `Error: ${data.error}`, type: 'error' });
      }
    } catch {
      setMsg({ text: 'Network error', type: 'error' });
    } finally {
      setScrapingFst(false);
    }
  }

  async function handleResolveFst() {
    setResolvingFst(true);
    setMsg(null);
    try {
      const res = await fetch('/api/fst/resolve', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setMsg({ text: `✓ ${data.message}`, type: 'success' });
        setTimeout(fetchTips, 90_000);
      } else {
        setMsg({ text: `Error: ${data.error}`, type: 'error' });
      }
    } catch {
      setMsg({ text: 'Network error', type: 'error' });
    } finally {
      setResolvingFst(false);
    }
  }

  const msgClass = {
    success: 'text-green-400 bg-green-500/10 border-green-500/20',
    error: 'text-red-400 bg-red-500/10 border-red-500/20',
    info: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  };

  return (
    <section className="mt-12">
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xs uppercase tracking-widest text-[var(--chalk-dim)]">
            FreeSuperTips · Bet of the Day
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleResolveFst}
            disabled={resolvingFst}
            className="text-[10px] px-2.5 py-1.5 rounded-lg border border-[var(--border-strong)] text-[var(--chalk-dim)] hover:text-[var(--chalk)] hover:border-white/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {resolvingFst ? '…' : '⟳ Resolve'}
          </button>
          <button
            onClick={handleScrapeFst}
            disabled={scrapingFst}
            className="text-[10px] px-2.5 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {scrapingFst ? '…' : '↓ Scrape FST'}
          </button>
        </div>
      </div>

      {/* Message */}
      {msg && (
        <div className={`mb-3 text-xs px-3 py-2 rounded-lg border animate-fade-in ${msgClass[msg.type]}`}>
          {msg.text}
        </div>
      )}

      {/* Stats bar */}
      {stats.total > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <FstStatCard
            label="Win Rate"
            value={stats.total > 0 ? `${stats.winRate.toFixed(1)}%` : '—'}
            sub={`${stats.wins}W / ${stats.losses}L`}
            accent={stats.winRate >= 50 ? 'green' : stats.winRate > 0 ? 'red' : 'dim'}
          />
          <FstStatCard
            label="Total Tips"
            value={String(stats.total)}
            sub={`${stats.pending} pending`}
            accent="dim"
          />
          <FstStatCard
            label="Streak"
            value={stats.currentStreak > 0 ? String(stats.currentStreak) : '—'}
            sub={stats.streakType !== 'NONE' ? `${stats.streakType === 'WIN' ? '🟢' : '🔴'} ${stats.streakType}` : 'No data yet'}
            accent={stats.streakType === 'WIN' ? 'green' : stats.streakType === 'LOSS' ? 'red' : 'dim'}
          />
          <FstStatCard
            label="Avg Odds"
            value={stats.total > 0 ? stats.avgOdds.toFixed(2) : '—'}
            sub="best bookie"
            accent="dim"
            mono
          />
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-[var(--border)] mb-4" />

      {/* Content */}
      {loading && (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 rounded-full border-2 border-blue-400/30 border-t-blue-400 animate-spin" />
        </div>
      )}

      {!loading && tips.length === 0 && (
        <div className="text-center py-10 border border-dashed border-[var(--border)] rounded-xl">
          <div className="text-2xl mb-2">🎯</div>
          <p className="text-[var(--chalk-dim)] text-sm">No FST tips yet.</p>
          <p className="text-[var(--chalk-dim)] text-xs mt-1">Click ↓ Scrape FST to fetch today's tip.</p>
        </div>
      )}

      {!loading && tips.length > 0 && (
        <div className="space-y-3">
          {tips.map((tip, i) => (
            <FstCard key={tip.id} tip={tip} index={i} />
          ))}
        </div>
      )}

      <div className="mt-8 pb-8 text-center">
        <p className="text-[10px] text-[var(--chalk-dim)] uppercase tracking-widest">
          BetMines Double Tracker
        </p>
      </div>
    </section>
  );
}

function FstStatCard({
  label, value, sub, accent, mono,
}: {
  label: string; value: string; sub: string;
  accent: 'green' | 'red' | 'dim'; mono?: boolean;
}) {
  const accentClass = { green: 'text-green-400', red: 'text-red-400', dim: 'text-[var(--chalk)]' }[accent];
  return (
    <div className="card p-4">
      <p className="text-xs uppercase tracking-widest text-[var(--chalk-dim)] mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accentClass} ${mono ? 'font-mono-data' : ''}`}>{value}</p>
      <p className="text-xs text-[var(--chalk-dim)] mt-1">{sub}</p>
    </div>
  );
}
