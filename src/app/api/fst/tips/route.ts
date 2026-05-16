// src/app/api/fst/tips/route.ts
import { NextResponse } from 'next/server';
import { getAllFstTips } from '@/lib/services/fstService';

export async function GET() {
  try {
    const tips = await getAllFstTips();
    return NextResponse.json({ tips });
  } catch (err) {
    console.error('[API /fst/tips]', err);
    return NextResponse.json({ error: 'Failed to fetch FST tips' }, { status: 500 });
  }
}
