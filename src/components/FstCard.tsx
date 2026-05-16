// src/components/FstCard.tsx
import type { FstTipRecord } from '@/lib/types';
import { StatusBadge } from './StatusBadge';

interface Props {
  tip: FstTipRecord;
  index: number;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function FstCard({ tip, index }: Props) {
  const cardClass = {
    WIN: 'card-win',
    LOSS: 'card-loss',
    PENDING: 'card-pending',
    VOID: '',
  }[tip.status] ?? '';

  const delay = `${index * 60}ms`;
  const hasScore = tip.homeScore !== null && tip.awayScore !== null;

  return (
    <div
      className={`card ${cardClass} p-5 animate-slide-up`}
      style={{ animationDelay: delay, opacity: 0 }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-[var(--chalk-dim)] mb-0.5">
            {formatDate(tip.date)}
          </p>
          <div className="flex items-center gap-3">
            {tip.odd > 0 && (
              <span className="font-mono-data text-xl font-bold text-[var(--chalk)]">
                @{tip.odd.toFixed(2)}
              </span>
            )}
            <span className="text-[10px] uppercase tracking-widest text-[var(--chalk-dim)]/60">
              FreeSuperTips · BOTD
            </span>
          </div>
        </div>
        <StatusBadge status={tip.status} size="lg" />
      </div>

      {/* Match */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Teams */}
          <p className="text-sm font-medium text-[var(--chalk)] leading-tight">
            <span>{tip.homeTeam}</span>
            <span className="text-[var(--chalk-dim)] mx-2">vs</span>
            <span>{tip.awayTeam}</span>
          </p>

          {/* Market + pick */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-[11px] bg-white/5 rounded px-2 py-0.5 text-[var(--chalk-dim)] border border-white/8">
              {tip.market}
            </span>
            <span className="text-[11px] text-[var(--chalk-dim)]/70 italic truncate">
              {tip.pick}
            </span>
          </div>

          {/* Kickoff */}
          {tip.kickoff && (
            <p className="text-[10px] text-[var(--chalk-dim)] mt-1.5">
              Kickoff: {tip.kickoff}
            </p>
          )}
        </div>

        {/* Score */}
        {hasScore && (
          <div className="flex-shrink-0">
            <span className="font-mono-data text-sm font-bold text-[var(--chalk)]">
              {tip.homeScore} - {tip.awayScore}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
