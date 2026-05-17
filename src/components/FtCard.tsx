'use client';
import type { FtTipRecord } from '@/lib/services/ftService';
import { StatusBadge } from './StatusBadge';

interface Props {
  tip: FtTipRecord;
  index: number;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function FtCard({ tip, index }: Props) {
  const cardClass = { WIN: 'card-win', LOSS: 'card-loss', PENDING: 'card-pending', VOID: '' }[tip.status] ?? '';
  const delay = `${index * 60}ms`;
  const hasScore = tip.homeScore !== null && tip.awayScore !== null;

  return (
    <div className={`card ${cardClass} p-5 animate-slide-up`} style={{ animationDelay: delay, opacity: 0 }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-[var(--chalk-dim)] mb-0.5">
            {formatDate(tip.date)}
            {tip.kickoff && (
              <span className="ml-2 text-[var(--chalk-dim)]/60">· {tip.kickoff}</span>
            )}
          </p>
          <p className="font-medium text-[var(--chalk)] leading-tight">
            {tip.homeTeam}
            <span className="text-[var(--chalk-dim)] mx-2">vs</span>
            {tip.awayTeam}
          </p>
        </div>
        <StatusBadge status={tip.status} size="lg" />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] bg-white/5 rounded px-2 py-0.5 text-[var(--chalk-dim)] border border-white/8">
          {tip.market}
        </span>
        <span className="text-[11px] bg-white/5 rounded px-2 py-0.5 text-[var(--chalk-dim)] border border-white/8">
          {tip.pick}
        </span>
        {tip.odd > 0 && (
          <span className="font-mono-data text-sm text-[var(--accent)]">
            @{tip.odd.toFixed(2)}
          </span>
        )}
        {hasScore && (
          <span className="font-mono-data text-sm text-[var(--chalk-dim)] ml-auto">
            {tip.homeScore}–{tip.awayScore}
          </span>
        )}
      </div>
    </div>
  );
}
