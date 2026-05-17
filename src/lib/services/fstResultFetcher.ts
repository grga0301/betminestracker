// src/lib/services/fstResultFetcher.ts
// Fetches match results: TheSportsDB first, ESPN as fallback

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

// ESPN covers: Premier League, La Liga, Bundesliga, Serie A, Ligue 1,
// Eredivisie, Primeira Liga, Super Lig, MLS, UCL, UEL, UECL, etc.
const ESPN_LEAGUES = [
  'eng.1', 'esp.1', 'ger.1', 'ita.1', 'fra.1',
  'ned.1', 'por.1', 'tur.1', 'bel.1', 'sco.1',
  'usa.1', 'gre.1', 'aut.1', 'ukr.1', 'hrv.1',
  'UEFA.CHAMPIONS_LEAGUE', 'UEFA.EUROPA', 'UEFA.EUROPA_CONFERENCE_LEAGUE',
];

async function fetchScoreFromESPN(
  homeTeam: string,
  awayTeam: string,
  date: string,
): Promise<MatchScore | null> {
  const d = date.replace(/-/g, ''); // YYYYMMDD

  // Fetch all leagues in parallel — take first hit
  const results = await Promise.allSettled(
    ESPN_LEAGUES.map((league) =>
      fetchJson(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?dates=${d}`
      )
    )
  );

  for (const result of results) {
    if (result.status !== 'fulfilled' || !result.value) continue;
    const events = result.value.events ?? [];

    for (const event of events) {
      const competition = event.competitions?.[0];
      if (!competition) continue;

      const statusName = competition.status?.type?.name ?? '';
      if (statusName !== 'STATUS_FINAL') continue;

      const competitors: any[] = competition.competitors ?? [];
      const home = competitors.find((c) => c.homeAway === 'home');
      const away = competitors.find((c) => c.homeAway === 'away');
      if (!home || !away) continue;

      const homeName: string = home.team?.displayName ?? home.team?.name ?? '';
      const awayName: string = away.team?.displayName ?? away.team?.name ?? '';

      const homeOk = teamsMatch(homeName, homeTeam) || teamsMatch(homeName, awayTeam);
      const awayOk = teamsMatch(awayName, awayTeam) || teamsMatch(awayName, homeTeam);
      if (!homeOk || !awayOk) continue;

      const hs = parseInt(home.score ?? '', 10);
      const as_ = parseInt(away.score ?? '', 10);
      if (isNaN(hs) || isNaN(as_)) continue;

      // Return with correct home/away orientation
      if (teamsMatch(homeName, homeTeam)) return { homeScore: hs, awayScore: as_ };
      return { homeScore: as_, awayScore: hs };
    }
  }

  return null;
}

export async function fetchScoreFromSportsDB(
  homeTeam: string,
  awayTeam: string,
  date: string
): Promise<MatchScore | null> {
  // 1. TheSportsDB eventsday — fast, covers major leagues
  const dayJson = await fetchJson(
    `https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${date}&s=Soccer`
  );
  if (dayJson) {
    const found = findInEvents(dayJson.events ?? [], homeTeam, awayTeam);
    if (found) return found;
  }

  // 2. TheSportsDB search by name
  const query = encodeURIComponent(`${homeTeam} vs ${awayTeam}`);
  const searchJson = await fetchJson(
    `https://www.thesportsdb.com/api/v1/json/3/searchevents.php?e=${query}`
  );
  if (searchJson) {
    const eventsOnDate = (searchJson.event ?? []).filter((e: any) => e.dateEvent === date);
    const found = findInEvents(eventsOnDate, homeTeam, awayTeam);
    if (found) return found;
  }

  // 3. TheSportsDB reversed search
  const query2 = encodeURIComponent(`${awayTeam} vs ${homeTeam}`);
  const searchJson2 = await fetchJson(
    `https://www.thesportsdb.com/api/v1/json/3/searchevents.php?e=${query2}`
  );
  if (searchJson2) {
    const eventsOnDate2 = (searchJson2.event ?? []).filter((e: any) => e.dateEvent === date);
    const found = findInEvents(eventsOnDate2, homeTeam, awayTeam);
    if (found) return found;
  }

  // 4. ESPN fallback — covers leagues TheSportsDB free tier misses
  const espnScore = await fetchScoreFromESPN(homeTeam, awayTeam, date);
  if (espnScore) return espnScore;

  return null;
}
