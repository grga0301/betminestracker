// src/components/DoubleCard.tsx

import type { DoubleRecord } from '@/lib/types';
import { StatusBadge } from './StatusBadge';

interface Props {
  double: DoubleRecord;
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

function formatKickoff(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function scoreLabel(s: DoubleRecord['selections'][0]): string {
  if (s.homeScore !== null && s.awayScore !== null) {
    return `${s.homeScore} - ${s.awayScore}`;
  }
  return '? - ?';
}

export function DoubleCard({ double, index }: Props) {
  const cardClass = {
    WIN: 'card-win',
    LOSS: 'card-loss',
    PENDING: 'card-pending',
    VOID: '',
  }[double.status];

  const delay = `${index * 60}ms`;

  return (
    <div
      className={`card ${cardClass} p-5 animate-slide-up`}
      style={{ animationDelay: delay, opacity: 0 }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-[var(--chalk-dim)] mb-0.5">
            {formatDate(double.date)}
          </p>
          <div className="flex items-center gap-3">
            <span className="font-mono-data text-xl font-bold text-[var(--chalk)]">
              ×{double.totalOdds.toFixed(2)}
            </span>
            <span className="text-[var(--chalk-dim)] text-xs">total odds</span>
          </div>
        </div>
        <StatusBadge status={double.status} size="lg" />
      </div>

      {/* Selections */}
      <div className="space-y-3">
        {double.selections.map((sel, i) => (
          <div key={sel.id}>
            {i > 0 && (
              <div className="flex items-center gap-2 my-3">
                <div className="flex-1 border-t divider" />
                <span className="text-[10px] font-mono-data text-[var(--chalk-dim)] tracking-wider">
                  AND
                </span>
                <div className="flex-1 border-t divider" />
              </div>
            )}

            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                {/* League */}
                <p className="text-[10px] uppercase tracking-wider text-[var(--chalk-dim)] mb-1 truncate">
                  {sel.country} · {sel.league}
                </p>

                {/* Teams */}
                <p className="text-sm font-medium text-[var(--chalk)] leading-tight">
                  <span className="text-[var(--chalk)]">{sel.homeTeam}</span>
                  <span className="text-[var(--chalk-dim)] mx-2">vs</span>
                  <span className="text-[var(--chalk)]">{sel.awayTeam}</span>
                </p>

                {/* Market */}
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[11px] bg-white/5 rounded px-2 py-0.5 text-[var(--chalk-dim)] border border-white/8">
                    {sel.market}
                  </span>
                  <span className="font-mono-data text-sm text-[var(--accent)]">
                    @{sel.odd.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Right: Score + status */}
              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                <StatusBadge status={sel.resultStatus} size="sm" />
                {(sel.homeScore !== null || sel.awayScore !== null) && (
                  <span className="font-mono-data text-sm font-bold text-[var(--chalk)]">
                    {scoreLabel(sel)}
                  </span>
                )}
                <span className="text-[10px] text-[var(--chalk-dim)]">
                  {formatKickoff(sel.kickoff)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
