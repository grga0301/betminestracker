import { NextResponse } from 'next/server';
import { EXT_SOURCES, computeExtStats, getExtTips, type ExtSource } from '@/lib/services/extTipService';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const source = new URL(req.url).searchParams.get('source')?.toUpperCase() as ExtSource;
  if (!EXT_SOURCES.includes(source)) {
    return NextResponse.json({ error: `source must be one of ${EXT_SOURCES.join(', ')}` }, { status: 400 });
  }
  try {
    const tips = await getExtTips(source);
    return NextResponse.json({ tips, stats: computeExtStats(tips) });
  } catch (err) {
    console.error('[API /ext/tips]', err);
    return NextResponse.json({ error: 'Failed to fetch tips' }, { status: 500 });
  }
}
