'use client';

import { useEffect, useState } from 'react';

interface Source { key: string; label: string; last: string | null; ageDays: number | null; stale: boolean }

/** Amber banner listing sources whose newest tip is too old — i.e. a scraper has silently stopped. */
export function SourceHealth() {
  const [stale, setStale] = useState<Source[]>([]);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setStale((d.sources ?? []).filter((s: Source) => s.stale)))
      .catch(() => {});
  }, []);

  if (stale.length === 0) return null;
  return (
    <div className="mb-6 rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3" role="status">
      <p className="text-sm font-bold text-amber-300">⚠ Izvori bez novih tipova</p>
      <ul className="mt-1 space-y-0.5">
        {stale.map((s) => (
          <li key={s.key} className="text-sm text-amber-200">
            <strong>{s.label}</strong>:{' '}
            {s.last ? `zadnji tip ${s.last} (prije ${s.ageDays} dana)` : 'još nema tipova'}
          </li>
        ))}
      </ul>
    </div>
  );
}
