// src/app/dashboard/page.tsx
import Link from 'next/link';
import { getDashboard, type SourceSummary } from '@/lib/services/dashboardService';
import { ALERT_STREAK } from '@/lib/streak';

export const dynamic = 'force-dynamic';

const pct = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)}%`);
const units = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}u`;
const tone = (v: number | null, good = 0) =>
  v === null ? 'text-[var(--chalk)]' : v > good ? 'text-green-400' : v < good ? 'text-red-400' : 'text-[var(--chalk)]';

export default async function DashboardPage() {
  let sources: SourceSummary[] = [];
  let error = false;
  try {
    sources = await getDashboard();
  } catch (e) {
    console.error('[dashboard]', e);
    error = true;
  }

  const active = sources.filter((s) => s.total > 0);
  // Every source with data is listed; ones without a resolved tip yet sink to the bottom.
  const ranked = [...active].sort((a, b) => (b.roi ?? -Infinity) - (a.roi ?? -Infinity));
  const onStreak = (s: SourceSummary) => s.currentStreak.type === 'LOSS' && s.currentStreak.tickets >= ALERT_STREAK;
  const alerts = active.filter(onStreak);

  return (
    <div className="min-h-screen relative z-10">
      <header className="border-b border-[var(--border)]">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="font-mono-data text-[var(--chalk)] font-bold">Dashboard</h1>
          <Link href="/" className="text-[11px] uppercase tracking-wider text-[var(--chalk-dim)] hover:text-[var(--chalk)]">
            ← Povijest
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {error && <p className="text-red-400 text-sm">⚠ Ne mogu učitati podatke iz baze.</p>}

        {alerts.length > 0 && (
          <div className="rounded-xl border-2 border-red-500/60 bg-red-500/15 px-4 py-3" role="alert">
            <p className="text-sm font-bold text-red-300">🚨 Niz gubitaka ({ALERT_STREAK}+ tipa zaredom)</p>
            <ul className="mt-1 space-y-0.5">
              {alerts.map((s) => (
                <li key={s.key} className="text-sm text-red-200">
                  <strong>{s.label}</strong>: {s.currentStreak.tickets} zaredom pogrešno ({s.currentStreak.days}{' '}
                  {s.currentStreak.days === 1 ? 'dan' : 'dana'})
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Comparison table */}
        {ranked.length > 0 && (
          <section>
            <h2 className="text-xs uppercase tracking-widest text-[var(--chalk-dim)] mb-3">
              Usporedba izvora · po ROI-u
            </h2>
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--chalk-dim)] border-b border-[var(--border)]">
                    <th className="px-4 py-2">Izvor</th>
                    <th className="px-2 py-2 text-right">Prolaznost</th>
                    <th className="px-2 py-2 text-right">W / L</th>
                    <th className="px-2 py-2 text-right">Profit</th>
                    <th className="px-2 py-2 text-right">ROI</th>
                    <th className="px-2 py-2 text-right">Zadnjih 30d</th>
                    <th className="px-4 py-2 text-right">Niz</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((s) => (
                    <tr
                      key={s.key}
                      className={`border-b border-white/5 last:border-0 ${onStreak(s) ? 'bg-red-500/15' : ''}`}
                    >
                      <td className="px-4 py-2 text-[var(--chalk)]">
                        {s.label}
                        {s.winRate === null && (
                          <span className="ml-2 text-[10px] text-[var(--chalk-dim)]">čeka prvi rezultat</span>
                        )}
                      </td>
                      <td className={`px-2 py-2 text-right font-mono-data ${tone(s.winRate, 49.999)}`}>{pct(s.winRate)}</td>
                      <td className="px-2 py-2 text-right font-mono-data text-[var(--chalk-dim)]">{s.wins} / {s.losses}</td>
                      <td className={`px-2 py-2 text-right font-mono-data ${tone(s.profit)}`}>{units(s.profit)}</td>
                      <td className={`px-2 py-2 text-right font-mono-data ${tone(s.roi)}`}>{pct(s.roi)}</td>
                      <td className="px-2 py-2 text-right font-mono-data text-[var(--chalk-dim)]">{pct(s.last30.winRate)}</td>
                      <td className="px-4 py-2 text-right font-mono-data">
                        <Streak s={s} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-[var(--chalk-dim)] mt-2">
              Profit i ROI računaju ulog 1u na svaki riješen tiket (WIN = kvota − 1, LOSS = −1). VOID i PENDING se ne
              računaju. Mali uzorci (&lt; 30 tiketa) nisu statistički pouzdani.
            </p>
          </section>
        )}

        {/* Per-source cards */}
        <section className="grid md:grid-cols-2 gap-4">
          {sources.map((s) => (
            <SourceCard key={s.key} s={s} alert={onStreak(s)} />
          ))}
        </section>
      </main>
    </div>
  );
}

function Streak({ s }: { s: SourceSummary }) {
  const c = s.currentStreak;
  if (c.type === 'NONE') return <span className="text-[var(--chalk-dim)]">—</span>;
  return (
    <span className={c.type === 'WIN' ? 'text-green-400' : 'text-red-400'}>
      {c.type === 'WIN' ? 'W' : 'L'}
      {c.tickets}
      <span className="text-[var(--chalk-dim)]"> · {c.days}d</span>
    </span>
  );
}

function SourceCard({ s, alert }: { s: SourceSummary; alert: boolean }) {
  if (s.total === 0) {
    return (
      <div className="card p-5 opacity-60">
        <h3 className="text-sm font-medium text-[var(--chalk)]">{s.label}</h3>
        <p className="text-xs text-[var(--chalk-dim)] mt-2">Još nema podataka.</p>
      </div>
    );
  }
  const c = s.currentStreak;
  return (
    <div className={`card p-5 ${alert ? 'border-2 border-red-500/60 bg-red-500/10' : ''}`}>
      {alert && (
        <p className="mb-3 text-xs font-bold text-red-300">🚨 {c.tickets} gubitaka zaredom</p>
      )}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-medium text-[var(--chalk)]">{s.label}</h3>
          <p className="text-[10px] text-[var(--chalk-dim)] mt-0.5">
            {s.total} tiketa · {s.pending} pending · {s.firstDate} → {s.lastDate}
          </p>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-bold font-mono-data ${tone(s.winRate, 49.999)}`}>{pct(s.winRate)}</p>
          <p className="text-[10px] text-[var(--chalk-dim)]">{s.wins}W / {s.losses}L</p>
        </div>
      </div>

      <Form results={s.form} />

      <div className="grid grid-cols-3 gap-3 mt-4 text-center">
        <Mini label="Profit" value={units(s.profit)} cls={tone(s.profit)} />
        <Mini label="ROI" value={pct(s.roi)} cls={tone(s.roi)} />
        <Mini label="Prosj. kvota" value={s.avgOdds.toFixed(2)} cls="text-[var(--chalk)]" />
      </div>

      <div className="mt-4 rounded-lg bg-white/[0.03] border border-white/5 px-3 py-2 text-xs space-y-1">
        <Row
          k="Trenutni niz"
          v={
            c.type === 'NONE'
              ? '—'
              : `${c.type === 'WIN' ? 'dobitni' : 'gubitni'}: ${c.days} ${c.days === 1 ? 'dan' : 'dana'} (${c.tickets} tiketa)`
          }
          cls={c.type === 'LOSS' ? 'text-red-400' : c.type === 'WIN' ? 'text-green-400' : ''}
        />
        <Row k="Najduži pad" v={`${s.longestLossDays} dana (${s.longestLossTickets} tiketa)`} />
        <Row k="Najduži dobitni niz" v={`${s.longestWinTickets} tiketa`} />
        <Row k="Zadnjih 30 dana" v={`${pct(s.last30.winRate)} (${s.last30.wins}W / ${s.last30.losses}L)`} />
      </div>

      {s.curve.length > 1 && (
        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-widest text-[var(--chalk-dim)] mb-1">Kumulativni profit (1u)</p>
          <Curve points={s.curve} />
        </div>
      )}
    </div>
  );
}

function Mini({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-[var(--chalk-dim)]">{label}</p>
      <p className={`font-mono-data text-base font-bold ${cls}`}>{value}</p>
    </div>
  );
}

function Row({ k, v, cls = '' }: { k: string; v: string; cls?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[var(--chalk-dim)]">{k}</span>
      <span className={`font-mono-data ${cls}`}>{v}</span>
    </div>
  );
}

function Form({ results }: { results: ('WIN' | 'LOSS')[] }) {
  if (results.length === 0) return <p className="text-[10px] text-[var(--chalk-dim)]">Nema riješenih tiketa.</p>;
  return (
    <div className="flex gap-1 flex-wrap" title="Zadnjih 20 riješenih, najnoviji desno">
      {results.map((r, i) => (
        <span
          key={i}
          className={`w-4 h-4 rounded-sm text-[9px] leading-4 text-center font-bold ${
            r === 'WIN' ? 'bg-green-500/80 text-black' : 'bg-red-500/80 text-black'
          }`}
        >
          {r === 'WIN' ? 'W' : 'L'}
        </span>
      ))}
    </div>
  );
}

function Curve({ points }: { points: number[] }) {
  const w = 300, h = 60, pad = 4;
  const min = Math.min(0, ...points), max = Math.max(0, ...points);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (points.length - 1)) * (w - 2 * pad);
  const y = (v: number) => h - pad - ((v - min) / span) * (h - 2 * pad);
  const d = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-16" role="img" aria-label="Kumulativni profit">
      <line x1={pad} x2={w - pad} y1={y(0)} y2={y(0)} stroke="currentColor" className="text-white/15" strokeDasharray="3 3" />
      <path d={d} fill="none" strokeWidth={1.5} stroke={last >= 0 ? '#22c55e' : '#ef4444'} />
    </svg>
  );
}
