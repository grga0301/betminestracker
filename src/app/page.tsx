// src/app/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { Header } from '@/components/Header';
import { StatsBar } from '@/components/StatsBar';
import { DoubleCard } from '@/components/DoubleCard';
import { FstSection } from '@/components/FstSection';
import type { DoubleRecord, Stats } from '@/lib/types';

const DEFAULT_STATS: Stats = {
  total: 0,
  wins: 0,
  losses: 0,
  pending: 0,
  winRate: 0,
  currentStreak: 0,
  streakType: 'NONE',
  avgOdds: 0,
};

export default function HomePage() {
  const [doubles, setDoubles] = useState<DoubleRecord[]>([]);
  const [stats, setStats] = useState<Stats>(DEFAULT_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/doubles');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setDoubles(data.doubles);
      setStats(data.stats);
    } catch (err) {
      setError('Could not load data. Make sure the database is initialized.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="min-h-screen relative z-10">
      <Header onRefresh={fetchData} />

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Stats */}
        <StatsBar stats={stats} />

        {/* Content */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-[var(--accent)]/30 border-t-[var(--accent)] animate-spin" />
            <p className="text-[var(--chalk-dim)] text-sm">Loading doubles...</p>
          </div>
        )}

        {error && (
          <div className="text-center py-16">
            <p className="text-red-400 text-sm mb-2">⚠ {error}</p>
            <p className="text-[var(--chalk-dim)] text-xs">
              Run <code className="font-mono-data bg-white/5 px-1.5 py-0.5 rounded">npm run db:migrate</code> to initialize the database.
            </p>
          </div>
        )}

        {!loading && !error && doubles.length === 0 && (
          <div className="text-center py-24 border border-dashed border-[var(--border)] rounded-xl">
            <div className="text-4xl mb-4">⚽</div>
            <h2 className="font-mono-data text-[var(--chalk)] text-lg font-bold mb-2">
              No doubles yet
            </h2>
            <p className="text-[var(--chalk-dim)] text-sm mb-6">
              Click <strong>↓ Scrape Today</strong> to fetch today's BetMines double.
            </p>
            <p className="text-[var(--chalk-dim)] text-xs">
              Or run <code className="font-mono-data bg-white/5 px-1.5 py-0.5 rounded">npm run scrape</code> from the terminal.
            </p>
          </div>
        )}

        {!loading && !error && doubles.length > 0 && (
          <div>
            {/* Section header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs uppercase tracking-widest text-[var(--chalk-dim)]">
                History · {doubles.length} doubles
              </h2>
              <button
                onClick={fetchData}
                className="text-[10px] text-[var(--chalk-dim)] hover:text-[var(--chalk)] transition-colors uppercase tracking-wider"
              >
                ↺ Refresh
              </button>
            </div>

            {/* Cards grid */}
            <div className="space-y-4">
              {doubles.map((d, i) => (
                <DoubleCard key={d.id} double={d} index={i} />
              ))}
            </div>

            {/* Footer */}
            <div className="mt-4 pb-8 text-center">
              <p className="text-[10px] text-[var(--chalk-dim)] uppercase tracking-widest">
                BetMines Double Tracker
              </p>
            </div>
          </div>
        )}

        {/* FreeSuperTips section — always shown */}
        <FstSection />

        {!loading && !error && doubles.length === 0 && (
          <div className="pb-12" />
        )}
      </main>
    </div>
  );
}
