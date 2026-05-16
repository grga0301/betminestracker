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

export async function fetchScoreFromSportsDB(
  homeTeam: string,
  awayTeam: string,
  date: string
): Promise<MatchScore | null> {
  try {
    const url = `https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${date}&s=Soccer`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'betmines-tracker/1.0' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;

    const json = await res.json();
    const events: any[] = json.events ?? [];

    for (const ev of events) {
      const evHome = ev.strHomeTeam ?? '';
      const evAway = ev.strAwayTeam ?? '';
      const homeOk = teamsMatch(evHome, homeTeam) || teamsMatch(evHome, awayTeam);
      const awayOk = teamsMatch(evAway, awayTeam) || teamsMatch(evAway, homeTeam);

      if (!homeOk || !awayOk) continue;

      const intHome = parseInt(ev.intHomeScore ?? '', 10);
      const intAway = parseInt(ev.intAwayScore ?? '', 10);
      if (isNaN(intHome) || isNaN(intAway)) continue;

      // Re-orient scores to match our homeTeam/awayTeam order
      if (teamsMatch(evHome, homeTeam)) {
        return { homeScore: intHome, awayScore: intAway };
      } else {
        // Sides are flipped in the API response
        return { homeScore: intAway, awayScore: intHome };
      }
    }
    return null;
  } catch {
    return null;
  }
}
