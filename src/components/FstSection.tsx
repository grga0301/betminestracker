// src/components/FstSection.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import type { FstTipRecord } from '@/lib/types';
import { FstCard } from './FstCard';

export function FstSection() {
  const [tips, setTips] = useState<FstTipRecord[]>([]);
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
    } catch {
      // silently fail; show empty state
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
          text: data.triggered
            ? '⏳ FST scrape pokrenuto u pozadini. Osvježi za ~2 minute.'
            : `✓ ${data.message}`,
          type: data.triggered ? 'info' : 'success',
        });
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
        setMsg({
          text: data.triggered
            ? '⏳ FST resolve pokrenuto u pozadini. Osvježi za ~2 minute.'
            : `✓ ${data.message}`,
          type: data.triggered ? 'info' : 'success',
        });
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

  const wins = tips.filter((t) => t.status === 'WIN').length;
  const losses = tips.filter((t) => t.status === 'LOSS').length;

  return (
    <section className="mt-12">
      {/* Section header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-xs uppercase tracking-widest text-[var(--chalk-dim)]">
            FreeSuperTips · Bet of the Day
          </h2>
          {tips.length > 0 && (
            <p className="text-[10px] text-[var(--chalk-dim)]/60 mt-0.5">
              {wins}W / {losses}L
              {wins + losses > 0 && ` · ${((wins / (wins + losses)) * 100).toFixed(0)}% WR`}
            </p>
          )}
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
    </section>
  );
}
