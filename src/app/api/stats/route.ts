// src/app/api/stats/route.ts

import { NextResponse } from 'next/server';
import { getStats } from '@/lib/services/doubleService';

export async function GET() {
  try {
    const stats = await getStats();
    return NextResponse.json(stats);
  } catch (err) {
    console.error('[API /stats]', err);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
