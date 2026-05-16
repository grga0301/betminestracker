// src/components/Header.tsx
'use client';

import { useState } from 'react';

interface Props {
  onRefresh: () => void;
}

export function Header({ onRefresh }: Props) {
  const [scraping, setScraping] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  async function handleScrape() {
    setScraping(true);
    setMessage(null);
    try {
      const res = await fetch('/api/scrape', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setMessage({
          text: data.alreadyExists
            ? `Already scraped for ${data.date}`
            : `✓ Saved double for ${data.date} (×${data.totalOdds})`,
          type: data.alreadyExists ? 'info' : 'success',
        });
        onRefresh();
      } else {
        setMessage({ text: `Error: ${data.error}`, type: 'error' });
      }
    } catch {
      setMessage({ text: 'Network error. Is the server running?', type: 'error' });
    } finally {
      setScraping(false);
    }
  }

  async function handleResolve() {
    setResolving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/resolve', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setMessage({
          text: data.results.length === 0
            ? 'No pending doubles to resolve.'
            : `✓ Resolved ${data.results.length} double(s)`,
          type: 'success',
        });
        onRefresh();
      } else {
        setMessage({ text: `Error: ${data.error}`, type: 'error' });
      }
    } catch {
      setMessage({ text: 'Network error. Is the server running?', type: 'error' });
    } finally {
      setResolving(false);
    }
  }

  const msgClass = {
    success: 'text-green-400 bg-green-500/10 border-green-500/20',
    error: 'text-red-400 bg-red-500/10 border-red-500/20',
    info: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  };

  return (
    <header className="relative z-10 border-b border-[var(--border)] bg-[var(--pitch-mid)]/80 backdrop-blur-sm sticky top-0">
      <div className="max-w-4xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          {/* Logo */}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[var(--accent)] text-lg">⚽</span>
              <h1 className="font-mono-data font-bold text-[var(--chalk)] tracking-tight">
                BETMINES
                <span className="text-[var(--chalk-dim)] font-normal"> / DOUBLES</span>
              </h1>
            </div>
            <p className="text-[10px] text-[var(--chalk-dim)] uppercase tracking-widest mt-0.5">
              Local Bet Tracker
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleResolve}
              disabled={resolving}
              className="text-xs px-3 py-2 rounded-lg border border-[var(--border-strong)] text-[var(--chalk-dim)] hover:text-[var(--chalk)] hover:border-white/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {resolving ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                  Resolving...
                </span>
              ) : (
                '⟳ Resolve Results'
              )}
            </button>

            <button
              onClick={handleScrape}
              disabled={scraping}
              className="text-xs px-3 py-2 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/30 text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed font-medium"
            >
              {scraping ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  Scraping...
                </span>
              ) : (
                '↓ Scrape Today'
              )}
            </button>
          </div>
        </div>

        {/* Status message */}
        {message && (
          <div
            className={`mt-3 text-xs px-3 py-2 rounded-lg border animate-fade-in ${msgClass[message.type]}`}
          >
            {message.text}
          </div>
        )}
      </div>
    </header>
  );
}
