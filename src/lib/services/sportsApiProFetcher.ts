// src/lib/services/sportsApiProFetcher.ts
// Final scores from SportsAPIPro (v2 football): ONE call returns the whole day's schedule with scores and
// statuses (~350 matches, small leagues included). The free plan allows 100 calls/day, so day schedules are
// cached in the ScheduleCache table, shared by all workflows.
//
// Cache rules: today's schedule is refreshed at most every REFRESH_MINUTES; an older day is refreshed only if
// it still contained unfinished matches; at most MAX_CALLS_PER_RUN API calls per process.

import { prisma } from '../db/prisma';
import { teamsMatch, noteNameMiss } from './fstResultFetcher';

const REFRESH_MINUTES = 90;
const MAX_CALLS_PER_RUN = 3;
let callsThisRun = 0;
let blocked = false; // set after a 429/401 so the rest of the run does not keep trying

type Row = [home: string, away: string, homeScore: number | null, awayScore: number | null, status: string];

async function fetchDay(date: string): Promise<Row[] | null> {
  const key = process.env.SPORTSAPIPRO_KEY;
  if (!key || blocked || callsThisRun >= MAX_CALLS_PER_RUN) return null;
  callsThisRun++;
  try {
    const res = await fetch(`https://v2.football.sportsapipro.com/api/schedule/${date}`, {
      headers: { 'x-api-key': key },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      console.log(`  [SportsAPIPro] HTTP ${res.status}`);
      if (res.status === 429 || res.status === 401 || res.status === 403) blocked = true;
      return null;
    }
    const json = await res.json();
    const rows: Row[] = (json.events ?? []).map((e: any) => [
      String(e.homeTeam?.name ?? ''),
      String(e.awayTeam?.name ?? ''),
      e.homeScore?.current ?? null,
      e.awayScore?.current ?? null,
      String(e.status?.type ?? ''),
    ]);
    if (rows.length === 0) return null;
    try {
      const matches = JSON.stringify(rows);
      await prisma.scheduleCache.upsert({
        where: { date },
        create: { date, matches },
        update: { matches, fetchedAt: new Date() },
      });
    } catch (e) {
      console.log(`  [SportsAPIPro] cache write failed: ${e instanceof Error ? e.message : e}`);
    }
    return rows;
  } catch (e) {
    console.log(`  [SportsAPIPro] error: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

async function daySchedule(date: string): Promise<Row[] | null> {
  let cached: { rows: Row[]; fetchedAt: Date } | null = null;
  try {
    const c = await prisma.scheduleCache.findUnique({ where: { date } });
    if (c) cached = { rows: JSON.parse(c.matches) as Row[], fetchedAt: c.fetchedAt };
  } catch {
    // table missing (migration not applied yet) — fall through to a live call
  }
  if (cached) {
    const ageMin = (Date.now() - cached.fetchedAt.getTime()) / 60_000;
    const today = new Date().toISOString().slice(0, 10);
    const hasOpen = cached.rows.some((r) => r[4] === 'notstarted' || r[4] === 'inprogress');
    const fresh = date < today ? !hasOpen || ageMin < 24 * 60 : ageMin < REFRESH_MINUTES;
    if (fresh) return cached.rows;
  }
  return (await fetchDay(date)) ?? cached?.rows ?? null;
}

/** Final score of home vs away on `date` (or the day after/before), or null. Only finished matches count. */
export async function fetchScoreFromSportsApiPro(
  home: string,
  away: string,
  date: string,
  kickoffMs?: number
): Promise<{ homeScore: number; awayScore: number } | null> {
  if (!process.env.SPORTSAPIPRO_KEY) return null;
  // Do not spend calls on matches that cannot be over yet.
  const tooEarly = kickoffMs !== undefined ? Date.now() < kickoffMs + 2 * 3600 * 1000 : date >= new Date().toISOString().slice(0, 10);
  if (tooEarly) return null;

  // Schedules are by UTC day: an evening match in the Americas lands on the next day, a late tip date on the previous one.
  const shift = (n: number) => new Date(Date.parse(date) + n * 864e5).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  for (const day of [date, shift(1), shift(-1)].filter((d) => d <= today)) {
    const rows = await daySchedule(day);
    if (!rows) continue;
    for (const [h, a, hs, as, status] of rows) {
      if (status !== 'finished' || hs === null || as === null) continue;
      noteNameMiss(home, away, h, a, 'SportsAPIPro', day);
      if (teamsMatch(h, home) && teamsMatch(a, away)) return { homeScore: hs, awayScore: as };
      if (teamsMatch(h, away) && teamsMatch(a, home)) return { homeScore: as, awayScore: hs };
    }
  }
  return null;
}
