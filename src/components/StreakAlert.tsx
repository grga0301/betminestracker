'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Alert { key: string; label: string; tickets: number; days: number }

/** Red banner shown on every page that mounts it while any source is on a losing streak. */
export function StreakAlert() {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    fetch('/api/streaks')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setAlerts(d.alerts ?? []))
      .catch(() => {});
  }, []);

  if (alerts.length === 0) return null;
  return (
    <div className="mb-6 rounded-xl border-2 border-red-500/60 bg-red-500/15 px-4 py-3" role="alert">
      <p className="text-sm font-bold text-red-300">🚨 Niz gubitaka</p>
      <ul className="mt-1 space-y-0.5">
        {alerts.map((a) => (
          <li key={a.key} className="text-sm text-red-200">
            <strong>{a.label}</strong>: {a.tickets} {a.tickets < 5 ? 'tipa' : 'tipova'} zaredom pogrešno
            {a.days !== a.tickets && ` (${a.days} ${a.days === 1 ? 'dan' : 'dana'})`}
          </li>
        ))}
      </ul>
      <Link href="/dashboard" className="mt-2 inline-block text-[11px] uppercase tracking-wider text-red-300 hover:underline">
        Dashboard →
      </Link>
    </div>
  );
}
