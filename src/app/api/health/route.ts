import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { EXT_SOURCES } from '@/lib/services/extTipService';

export const dynamic = 'force-dynamic';

/** A source is "stale" when its newest tip is older than this many days. */
const STALE_DAYS = 2;

const EXT_LABELS: Record<string, string> = {
  TIPORACLE: 'TipOracle',
  FOOTYACCA: 'FootyAccumulators',
  FOOTYACCA_BTTS: 'FootyAcca BTTS',
  FOOTYACCA_OVER25: 'FootyAcca Over 2.5',
  FOOTBALLPARK: 'FootballPark',
  FOOTBALLSUPER: 'FootballSuper',
  ZULUBET: 'Zulubet',
};

function daysBetween(from: string, to: string): number {
  return Math.floor((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/** Newest tip date per source, so a silently broken scraper is visible on the site. */
export async function GET() {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const [bet, fst, ft, ...ext] = await Promise.all([
      prisma.betDouble.findFirst({ orderBy: { date: 'desc' }, select: { date: true } }),
      prisma.fstTip.findFirst({ orderBy: { date: 'desc' }, select: { date: true } }),
      prisma.ftTip.findFirst({ orderBy: { date: 'desc' }, select: { date: true } }),
      ...EXT_SOURCES.map((source) =>
        prisma.extTip.findFirst({ where: { source }, orderBy: { date: 'desc' }, select: { date: true } })
      ),
    ]);
    const rows = [
      { key: 'BETMINES', label: 'BetMines Double', last: bet?.date ?? null },
      { key: 'FST', label: 'FreeSuperTips', last: fst?.date ?? null },
      { key: 'FT', label: 'FreeTips', last: ft?.date ?? null },
      ...EXT_SOURCES.map((s, i) => ({ key: s, label: EXT_LABELS[s] ?? s, last: ext[i]?.date ?? null })),
    ].map((r) => {
      // Tips can be scheduled for tomorrow (e.g. FootyAccumulators), so a future date counts as fresh.
      const age = r.last ? Math.max(0, daysBetween(r.last, today)) : null;
      return { ...r, ageDays: age, stale: age === null || age > STALE_DAYS - 1 };
    });
    return NextResponse.json({ today, staleAfterDays: STALE_DAYS, sources: rows });
  } catch (err) {
    console.error('[API /health]', err);
    return NextResponse.json({ today, staleAfterDays: STALE_DAYS, sources: [] });
  }
}
