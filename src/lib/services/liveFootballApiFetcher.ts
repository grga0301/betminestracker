// src/lib/services/liveFootballApiFetcher.ts
// Final scores from live-football-api.com: GET /api/v1/matches?date= returns the whole day (~1400 matches in ~300
// leagues, small leagues included). Backup for SportsAPIPro, whose coverage has gaps.
//
// Budget: the free account holds 500 credits in total (1 per call, they never expire), so day schedules are cached in
// the ScheduleCache table (key "lfa:<date>", shared by all workflows), at most MAX_CALLS_PER_RUN calls per process, and
// no calls at all once fewer than MIN_CREDITS remain. Only matches with status "finished" count.

import { prisma } from '../db/prisma';
import { teamsMatch } from './fstResultFetcher';

const MAX_CALLS_PER_RUN = 2;
const MIN_CREDITS = 60;
const REFRESH_MINUTES = 180; // today / yesterday
let callsThisRun = 0;
let blocked = false;

type Row = [home: string, away: string, homeScore: number | null, awayScore: number | null, status: string];

async function fetchDay(date: string): Promise<Row[] | null> {
  const key = process.env.LIVEFOOTBALLAPI_KEY;
  if (!key || blocked || callsThisRun >= MAX_CALLS_PER_RUN) return null;
  callsThisRun++;
  try {
    const res = await fetch(`https://live-football-api.com/api/v1/matches?api_key=${key}&date=${date}&lang=en`, {
      signal: AbortSignal.timeout(60_000),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
      console.log(`  [LiveFootballAPI] HTTP ${res.status} ${String(json?.message ?? '').slice(0, 120)}`);
      if ([401, 403, 429].includes(res.status)) blocked = true;
      return null;
    }
    if (typeof json.credits_remaining === 'number') {
      console.log(`  [LiveFootballAPI] credits remaining: ${json.credits_remaining}`);
      if (json.credits_remaining < MIN_CREDITS) blocked = true; // keep the last credits for manual use
    }
    const num = (v: unknown) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));
    const rows: Row[] = (json.data?.matches ?? []).map((m: any) => [
      String(m.home?.name ?? ''),
      String(m.away?.name ?? ''),
      num(m.home?.score),
      num(m.away?.score),
      String(m.status?.status ?? ''),
    ]);
    if (rows.length === 0) return null;
    try {
      const matches = JSON.stringify(rows);
      await prisma.scheduleCache.upsert({
        where: { date: `lfa:${date}` },
        create: { date: `lfa:${date}`, matches },
        update: { matches, fetchedAt: new Date() },
      });
    } catch (e) {
      console.log(`  [LiveFootballAPI] cache write failed: ${e instanceof Error ? e.message : e}`);
    }
    return rows;
  } catch (e) {
    console.log(`  [LiveFootballAPI] error: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

async function daySchedule(date: string): Promise<Row[] | null> {
  let cached: { rows: Row[]; fetchedAt: Date } | null = null;
  try {
    const c = await prisma.scheduleCache.findUnique({ where: { date: `lfa:${date}` } });
    if (c) cached = { rows: JSON.parse(c.matches) as Row[], fetchedAt: c.fetchedAt };
  } catch {
    // table missing — fall through to a live call
  }
  if (cached) {
    const ageMin = (Date.now() - cached.fetchedAt.getTime()) / 60_000;
    const recent = date >= new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    const hasOpen = cached.rows.some((r) => ['scheduled', 'live'].includes(r[4]));
    const fresh = recent ? ageMin < REFRESH_MINUTES : !hasOpen || ageMin < 24 * 60;
    if (fresh) return cached.rows;
  }
  return (await fetchDay(date)) ?? cached?.rows ?? null;
}

export async function fetchScoreFromLiveFootballApi(
  home: string,
  away: string,
  date: string,
  kickoffMs?: number
): Promise<{ homeScore: number; awayScore: number } | null> {
  if (!process.env.LIVEFOOTBALLAPI_KEY) return null;
  const tooEarly = kickoffMs !== undefined ? Date.now() < kickoffMs + 2 * 3600 * 1000 : date >= new Date().toISOString().slice(0, 10);
  if (tooEarly) return null;

  const shift = (n: number) => new Date(Date.parse(date) + n * 864e5).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  for (const day of [date, shift(1), shift(-1)].filter((d) => d <= today)) {
    const rows = await daySchedule(day);
    if (!rows) continue;
    for (const [h, a, hs, as, status] of rows) {
      if (status !== 'finished' || hs === null || as === null) continue;
      if (teamsMatch(h, home) && teamsMatch(a, away)) return { homeScore: hs, awayScore: as };
      if (teamsMatch(h, away) && teamsMatch(a, home)) return { homeScore: as, awayScore: hs };
    }
  }
  return null;
}
