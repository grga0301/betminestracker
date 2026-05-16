// src/app/api/doubles/route.ts

import { NextResponse } from 'next/server';
import { getAllDoubles, getStats } from '@/lib/services/doubleService';

export async function GET() {
  try {
    const [doubles, stats] = await Promise.all([getAllDoubles(), getStats()]);
    return NextResponse.json({ doubles, stats });
  } catch (err) {
    console.error('[API /doubles]', err);
    return NextResponse.json(
      { error: 'Failed to fetch doubles' },
      { status: 500 }
    );
  }
}
