import { NextResponse } from 'next/server';
import { getAllFtTips, getFtStats } from '@/lib/services/ftService';

export async function GET() {
  try {
    const [tips, stats] = await Promise.all([getAllFtTips(), getFtStats()]);
    return NextResponse.json({ tips, stats });
  } catch (err) {
    console.error('[API /ft/tips]', err);
    return NextResponse.json({ error: 'Failed to fetch FT tips' }, { status: 500 });
  }
}
