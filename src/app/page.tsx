// src/app/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { StatsBar } from '@/components/StatsBar';
import { DoubleCard } from '@/components/DoubleCard';
import { FstSection } from '@/components/FstSection';
import { FtSection } from '@/components/FtSection';
import { ExtSection } from '@/components/ExtSection';
import { StreakAlert } from '@/components/StreakAlert';
import { SourceHealth } from '@/components/SourceHealth';
import type { DoubleRecord, Stats } from '@/lib/types';

/** How many BetMines doubles are shown before "View more". */
const DOUBLES_PREVIEW = 10;

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
  const [showAll, setShowAll] = useState(false);

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
        <StreakAlert />
        <SourceHealth />

        <div className="flex justify-end mb-3">
          <Link href="/dashboard" className="text-[11px] uppercase tracking-wider text-[var(--accent)] hover:underline">
            Dashboard →
          </Link>
        </div>

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
              {(showAll ? doubles : doubles.slice(0, DOUBLES_PREVIEW)).map((d, i) => (
                <DoubleCard key={d.id} double={d} index={i} />
              ))}
            </div>

            {doubles.length > DOUBLES_PREVIEW && (
              <button
                onClick={() => setShowAll((v) => !v)}
                className="mt-4 w-full rounded-lg border border-[var(--border)] py-2 text-xs uppercase tracking-wider text-[var(--chalk-dim)] hover:text-[var(--chalk)] transition-colors"
              >
                {showAll ? 'Show less' : `View more (${doubles.length - DOUBLES_PREVIEW})`}
              </button>
            )}

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

        {/* FreeTips.com section — always shown */}
        <FtSection />

        <ExtSection
          source="FOOTYACCA"
          title="FootyAccumulators · Bet of the Day"
          blurb="One featured bet per day, published the day before (often a combined market)."
        />

        <ExtSection
          source="FOOTYACCA_BTTS"
          title="FootyAccumulators · BTTS Treble"
          blurb="Three-match BTTS Yes treble, published the day before. Wins only if all three legs win."
        />
        <ExtSection
          source="FOOTYACCA_OVER25"
          title="FootyAccumulators · Over 2.5 Treble"
          blurb="Three-match Over 2.5 goals treble, published the day before. Wins only if all three legs win."
        />

        <ExtSection
          source="ZULUBET"
          title="Zulubet · Picks @1.7–2.2"
          blurb="Algorithmic 1X2 predictions: up to three most probable single picks per day priced 1.70–2.20, with full history."
        />

        <ExtSection
          source="FOOTBALLPARK"
          title="FootballPark · Bet of the Day"
          blurb="One single banker pick per day (usually 1X2) with odds."
        />

        <ExtSection
          source="FREETIPS_DOUBLE"
          title="FreeTips.com · Daily Double"
          blurb="Two picks per day as one ticket (odds around 3); tracked from 2026-10-25, no earlier history."
        />

        <ExtSection
          source="FOOTBALLSUPER"
          title="FootballSuper · Tip of the Day"
          blurb="One single pick per day with odds (around 1.8) from footballsuper.tips; tracked from 2026-10-25, no earlier history."
        />

        {!loading && !error && doubles.length === 0 && (
          <div className="pb-12" />
        )}
      </main>
    </div>
  );
}
