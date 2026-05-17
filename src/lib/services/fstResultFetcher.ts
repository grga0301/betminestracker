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

function isFinished(strStatus: string): boolean {
  const s = (strStatus ?? '').toLowerCase();
  return s === 'match finished' || s === 'ft' || s === 'aet' || s === 'pen';
}

interface MatchScore {
  homeScore: number;
  awayScore: number;
}

function extractScore(
  evHome: string,
  intHome: number,
  intAway: number,
  homeTeam: string,
): MatchScore {
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
  awayTeam: string,
): MatchScore | null {
  for (const ev of events) {
    // Must be a finished match
    if (!isFinished(ev.strStatus ?? '')) continue;

    const evHome = ev.strHomeTeam ?? '';
    const evAway = ev.strAwayTeam ?? '';

    const homeOk = teamsMatch(evHome, homeTeam) || teamsMatch(evHome, awayTeam);
    const awayOk = teamsMatch(evAway, awayTeam) || teamsMatch(evAway, homeTeam);
    if (!homeOk || !awayOk) continue;

    const intHome = parseInt(ev.intHomeScore ?? '', 10);
    const intAway = parseInt(ev.intAwayScore ?? '', 10);
    if (isNaN(intHome) || isNaN(intAway)) continue;

    return extractScore(evHome, intHome, intAway, homeTeam);
  }
  return null;
}

export async function fetchScoreFromSportsDB(
  homeTeam: string,
  awayTeam: string,
  date: string
): Promise<MatchScore | null> {
  // 1. eventsday — fast, only returns finished matches for the day
  const dayJson = await fetchJson(
    `https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${date}&s=Soccer`
  );
  if (dayJson) {
    const found = findInEvents(dayJson.events ?? [], homeTeam, awayTeam);
    if (found) return found;
  }

  // 2. Search by name, strict date filter — covers cup finals eventsday misses
  const query = encodeURIComponent(`${homeTeam} vs ${awayTeam}`);
  const searchJson = await fetchJson(
    `https://www.thesportsdb.com/api/v1/json/3/searchevents.php?e=${query}`
  );
  if (searchJson) {
    const eventsOnDate = (searchJson.event ?? []).filter(
      (e: any) => e.dateEvent === date
    );
    const found = findInEvents(eventsOnDate, homeTeam, awayTeam);
    if (found) return found;
  }

  // 3. Reversed search (Away vs Home), strict date filter
  const query2 = encodeURIComponent(`${awayTeam} vs ${homeTeam}`);
  const searchJson2 = await fetchJson(
    `https://www.thesportsdb.com/api/v1/json/3/searchevents.php?e=${query2}`
  );
  if (searchJson2) {
    const eventsOnDate2 = (searchJson2.event ?? []).filter(
      (e: any) => e.dateEvent === date
    );
    const found = findInEvents(eventsOnDate2, homeTeam, awayTeam);
    if (found) return found;
  }

  return null;
}
