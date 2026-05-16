// src/app/api/resolve/route.ts

import { NextResponse } from 'next/server';
import { resolveAllPending } from '@/lib/services/resolveService';

export async function POST() {
  try {
    console.log('[API /resolve] Starting resolver...');
    const results = await resolveAllPending();

    return NextResponse.json({
      message: `Resolved ${results.length} double(s).`,
      results,
    });
  } catch (err) {
    console.error('[API /resolve]', err);
    return NextResponse.json(
      { error: `Resolve failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
