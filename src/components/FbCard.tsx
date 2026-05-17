'use client';
import type { FbTicketRecord } from '@/lib/services/fbService';
import { StatusBadge } from './StatusBadge';

interface Props {
  ticket: FbTicketRecord;
  index: number;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function FbCard({ ticket, index }: Props) {
  const cardClass = { WIN: 'card-win', LOSS: 'card-loss', PENDING: 'card-pending' }[ticket.status] ?? '';
  const delay = `${index * 60}ms`;

  return (
    <div className={`card ${cardClass} p-5 animate-slide-up`} style={{ animationDelay: delay, opacity: 0 }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-[var(--chalk-dim)] mb-0.5">
            {formatDate(ticket.date)}
          </p>
          <div className="flex items-center gap-3">
            <span className="font-mono-data text-xl font-bold text-[var(--chalk)]">
              ×{ticket.totalOdds.toFixed(2)}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-[var(--chalk-dim)]/60">
              IceHockeyBet · Ticket
            </span>
          </div>
        </div>
        <StatusBadge status={ticket.status} size="lg" />
      </div>

      {/* Selections */}
      <div className="space-y-2">
        {ticket.selections.map((sel, i) => (
          <div key={sel.id}>
            {i > 0 && <div className="border-t divider my-2" />}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--chalk)] leading-tight">
                  {sel.homeTeam}
                  <span className="text-[var(--chalk-dim)] mx-2">-</span>
                  {sel.awayTeam}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] bg-white/5 rounded px-2 py-0.5 text-[var(--chalk-dim)] border border-white/8">
                    {sel.market}
                  </span>
                  <span className="font-mono-data text-sm text-[var(--accent)]">
                    @{sel.odd.toFixed(2)}
                  </span>
                </div>
              </div>
              <span className="text-[10px] text-[var(--chalk-dim)] flex-shrink-0 mt-1">
                {sel.kickoff}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
