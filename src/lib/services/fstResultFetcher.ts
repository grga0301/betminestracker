// src/lib/services/fstResultFetcher.ts
// Fetches match results from TheSportsDB (free, no key required)

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function teamsMatch(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

interface MatchScore {
  homeScore: number;
  awayScore: number;
}

function extractScore(
  evHome: string,
  evAway: string,
  intHome: number,
  intAway: number,
  homeTeam: string,
  awayTeam: string
): MatchScore {
  // Check if API sides match our sides, or are reversed
  if (teamsMatch(evHome, homeTeam)) {
    return { homeScore: intHome, awayScore: intAway };
  }
  return { homeScore: intAway, awayScore: intHome };
}

async function fetchJson(url: string): Promise<any> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'betmines-tracker/1.0' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function findInEvents(
  events: any[],
  homeTeam: string,
  awayTeam: string
): MatchScore | null {
  for (const ev of events) {
    const evHome = ev.strHomeTeam ?? '';
    const evAway = ev.strAwayTeam ?? '';

    const homeOk = teamsMatch(evHome, homeTeam) || teamsMatch(evHome, awayTeam);
    const awayOk = teamsMatch(evAway, awayTeam) || teamsMatch(evAway, homeTeam);
    if (!homeOk || !awayOk) continue;

    const intHome = parseInt(ev.intHomeScore ?? '', 10);
    const intAway = parseInt(ev.intAwayScore ?? '', 10);
    if (isNaN(intHome) || isNaN(intAway)) continue;

    return extractScore(evHome, evAway, intHome, intAway, homeTeam, awayTeam);
  }
  return null;
}

export async function fetchScoreFromSportsDB(
  homeTeam: string,
  awayTeam: string,
  date: string
): Promise<MatchScore | null> {
  // 1. eventsday — fast but incomplete for cup competitions
  const dayJson = await fetchJson(
    `https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${date}&s=Soccer`
  );
  if (dayJson) {
    const found = findInEvents(dayJson.events ?? [], homeTeam, awayTeam);
    if (found) return found;
  }

  // 2. Search by event name — covers cup finals that eventsday misses
  const query = encodeURIComponent(`${homeTeam} vs ${awayTeam}`);
  const searchJson = await fetchJson(
    `https://www.thesportsdb.com/api/v1/json/3/searchevents.php?e=${query}`
  );
  if (searchJson) {
    // Filter to events on the target date
    const eventsOnDate = (searchJson.event ?? []).filter(
      (e: any) => e.dateEvent === date
    );
    const found = findInEvents(eventsOnDate, homeTeam, awayTeam);
    if (found) return found;

    // Also try without date filter in case date is slightly off
    const foundAny = findInEvents(searchJson.event ?? [], homeTeam, awayTeam);
    if (foundAny) return foundAny;
  }

  // 3. Try reversed search (Away vs Home)
  const query2 = encodeURIComponent(`${awayTeam} vs ${homeTeam}`);
  const searchJson2 = await fetchJson(
    `https://www.thesportsdb.com/api/v1/json/3/searchevents.php?e=${query2}`
  );
  if (searchJson2) {
    const found = findInEvents(searchJson2.event ?? [], homeTeam, awayTeam);
    if (found) return found;
  }

  return null;
}
