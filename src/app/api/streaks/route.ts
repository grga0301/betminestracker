import { NextResponse } from 'next/server';
import { getDashboard } from '@/lib/services/dashboardService';
import { ALERT_STREAK } from '@/lib/streak';

export const dynamic = 'force-dynamic';

/** Sources currently on a losing streak of ALERT_STREAK tickets or more. */
export async function GET() {
  try {
    const alerts = (await getDashboard())
      .filter((s) => s.currentStreak.type === 'LOSS' && s.currentStreak.tickets >= ALERT_STREAK)
      .map((s) => ({ key: s.key, label: s.label, tickets: s.currentStreak.tickets, days: s.currentStreak.days }));
    return NextResponse.json({ threshold: ALERT_STREAK, alerts });
  } catch (err) {
    console.error('[API /streaks]', err);
    return NextResponse.json({ threshold: ALERT_STREAK, alerts: [] });
  }
}
