import { NextResponse } from 'next/server';
import { getAllFbTickets, getFbStats } from '@/lib/services/fbService';

export async function GET() {
  try {
    const [tickets, stats] = await Promise.all([getAllFbTickets(), getFbStats()]);
    return NextResponse.json({ tickets, stats });
  } catch (err) {
    console.error('[API /fb/tickets]', err);
    return NextResponse.json({ error: 'Failed to fetch FB tickets' }, { status: 500 });
  }
}
