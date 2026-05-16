// src/app/api/fst/tips/route.ts
import { NextResponse } from 'next/server';
import { getAllFstTips, getFstStats } from '@/lib/services/fstService';

export async function GET() {
  try {
    const [tips, stats] = await Promise.all([getAllFstTips(), getFstStats()]);
    return NextResponse.json({ tips, stats });
  } catch (err) {
    console.error('[API /fst/tips]', err);
    return NextResponse.json({ error: 'Failed to fetch FST tips' }, { status: 500 });
  }
}
