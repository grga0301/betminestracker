import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

/** Scores accepted from the Gemini web-search fallback (two agreeing votes), newest first, with source URLs. */
export async function GET() {
  try {
    const rows = await prisma.llmScore.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
    return NextResponse.json({
      scores: rows.map((r) => ({
        ...r,
        sources: JSON.parse(r.sources) as string[],
        models: JSON.parse(r.models) as string[],
      })),
    });
  } catch (err) {
    console.error('[API /llm-scores]', err);
    return NextResponse.json({ scores: [] });
  }
}
