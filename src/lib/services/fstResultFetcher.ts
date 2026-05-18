// src/lib/services/fstResultFetcher.ts
// Fetches match results: TheSportsDB → ESPN → SofaScore

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

async function fetchJson(url: string, timeoutMs = 10_000, extraHeaders: Record<string, string> = {}): Promise<any> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        ...extraHeaders,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const host = new URL(url).hostname;
      console.log(`  [HTTP] ${res.status} from ${host}`);
      return null;
    }
    return await res.json();
  } catch {
    return null;
  }
}

// ── TheSportsDB ───────────────────────────────────────────────────────────────

function findInSportsDBEvents(events: any[], homeTeam: string, awayTeam: string): MatchScore | null {
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
    if (teamsMatch(evHome, homeTeam)) return { homeScore: intHome, awayScore: intAway };
    return { homeScore: intAway, awayScore: intHome };
  }
  return null;
}

async function fetchFromSportsDB(homeTeam: string, awayTeam: string, date: string): Promise<MatchScore | null> {
  const dayJson = await fetchJson(`https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${date}&s=Soccer`);
  if (dayJson) {
    const found = findInSportsDBEvents(dayJson.events ?? [], homeTeam, awayTeam);
    if (found) return found;
  }

  for (const query of [
    encodeURIComponent(`${homeTeam} vs ${awayTeam}`),
    encodeURIComponent(`${awayTeam} vs ${homeTeam}`),
  ]) {
    const json = await fetchJson(`https://www.thesportsdb.com/api/v1/json/3/searchevents.php?e=${query}`);
    if (json) {
      const onDate = (json.event ?? []).filter((e: any) => e.dateEvent === date);
      const found = findInSportsDBEvents(onDate, homeTeam, awayTeam);
      if (found) return found;
    }
  }
  return null;
}

// ── ESPN ─────────────────────────────────────────────────────────────────────

const ESPN_LEAGUES = [
  'eng.1', 'esp.1', 'ger.1', 'ita.1', 'fra.1',
  'ned.1', 'por.1', 'tur.1', 'bel.1', 'sco.1',
  'usa.1', 'gre.1', 'aut.1', 'hrv.1',
  'UEFA.CHAMPIONS_LEAGUE', 'UEFA.EUROPA', 'UEFA.EUROPA_CONFERENCE_LEAGUE',
];

async function fetchFromESPN(homeTeam: string, awayTeam: string, date: string): Promise<MatchScore | null> {
  const d = date.replace(/-/g, '');
  const results = await Promise.allSettled(
    ESPN_LEAGUES.map((league) =>
      fetchJson(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?dates=${d}`,
        7_000
      )
    )
  );

  for (const result of results) {
    if (result.status !== 'fulfilled' || !result.value) continue;
    for (const event of result.value.events ?? []) {
      const competition = event.competitions?.[0];
      if (!competition) continue;
      const statusName: string = competition.status?.type?.name ?? '';
      if (!statusName.includes('FINAL') && !statusName.includes('FULL')) continue;

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

      if (teamsMatch(homeName, homeTeam)) return { homeScore: hs, awayScore: as_ };
      return { homeScore: as_, awayScore: hs };
    }
  }
  return null;
}

// ── API-Football (RapidAPI) ───────────────────────────────────────────────────
// Free tier: 100 req/day — covers all leagues including Allsvenskan, Eliteserien, etc.
// Register free at rapidapi.com → api-football → add RAPIDAPI_KEY to secrets

async function fetchFromApiFootball(homeTeam: string, awayTeam: string, date: string): Promise<MatchScore | null> {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) return null;

  const json = await fetchJson(
    `https://api-football-v1.p.rapidapi.com/v3/fixtures?date=${date}`,
    15_000,
    {
      'X-RapidAPI-Key': apiKey,
      'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com',
    }
  );
  if (!json) return null;

  for (const fixture of json.response ?? []) {
    const statusShort: string = fixture.fixture?.status?.short ?? '';
    if (!['FT', 'AET', 'PEN'].includes(statusShort)) continue;

    const home: string = fixture.teams?.home?.name ?? '';
    const away: string = fixture.teams?.away?.name ?? '';
    const homeOk = teamsMatch(home, homeTeam) || teamsMatch(home, awayTeam);
    const awayOk = teamsMatch(away, awayTeam) || teamsMatch(away, homeTeam);
    if (!homeOk || !awayOk) continue;

    const hs: number = fixture.goals?.home;
    const as_: number = fixture.goals?.away;
    if (hs === null || hs === undefined || as_ === null || as_ === undefined) continue;

    if (teamsMatch(home, homeTeam)) return { homeScore: hs, awayScore: as_ };
    return { homeScore: as_, awayScore: hs };
  }
  return null;
}

// ── SofaScore ────────────────────────────────────────────────────────────────
// Covers all leagues globally, no API key required

async function fetchFromSofaScore(homeTeam: string, awayTeam: string, date: string): Promise<MatchScore | null> {
  const json = await fetchJson(
    `https://api.sofascore.com/api/v1/sport/football/scheduled-events/${date}`,
    10_000,
    {
      'Referer': 'https://www.sofascore.com/',
      'Origin': 'https://www.sofascore.com',
      'Cache-Control': 'no-cache',
    }
  );
  if (!json) return null;

  for (const event of json.events ?? []) {
    const statusCode: number = event.status?.code ?? 0;
    // SofaScore: code 100 = finished, 120 = after extra time, 110 = after penalties
    if (statusCode !== 100 && statusCode !== 110 && statusCode !== 120) continue;

    const evHome: string = event.homeTeam?.name ?? '';
    const evAway: string = event.awayTeam?.name ?? '';
    const homeOk = teamsMatch(evHome, homeTeam) || teamsMatch(evHome, awayTeam);
    const awayOk = teamsMatch(evAway, awayTeam) || teamsMatch(evAway, homeTeam);
    if (!homeOk || !awayOk) continue;

    const hs: number = event.homeScore?.current ?? event.homeScore?.normaltime;
    const as_: number = event.awayScore?.current ?? event.awayScore?.normaltime;
    if (hs === undefined || as_ === undefined) continue;

    if (teamsMatch(evHome, homeTeam)) return { homeScore: hs, awayScore: as_ };
    return { homeScore: as_, awayScore: hs };
  }
  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function fetchScoreFromSportsDB(
  homeTeam: string,
  awayTeam: string,
  date: string
): Promise<MatchScore | null> {
  console.log(`  [Fetch] TheSportsDB...`);
  const sportsDb = await fetchFromSportsDB(homeTeam, awayTeam, date);
  if (sportsDb) { console.log(`  [Fetch] TheSportsDB: ${sportsDb.homeScore}-${sportsDb.awayScore}`); return sportsDb; }
  console.log(`  [Fetch] TheSportsDB: no result`);

  console.log(`  [Fetch] ESPN (${ESPN_LEAGUES.length} leagues parallel)...`);
  const espn = await fetchFromESPN(homeTeam, awayTeam, date);
  if (espn) { console.log(`  [Fetch] ESPN: ${espn.homeScore}-${espn.awayScore}`); return espn; }
  console.log(`  [Fetch] ESPN: no result`);

  console.log(`  [Fetch] API-Football...`);
  const apiFootball = await fetchFromApiFootball(homeTeam, awayTeam, date);
  if (apiFootball) { console.log(`  [Fetch] API-Football: ${apiFootball.homeScore}-${apiFootball.awayScore}`); return apiFootball; }
  console.log(`  [Fetch] API-Football: no result`);

  console.log(`  [Fetch] SofaScore...`);
  const sofa = await fetchFromSofaScore(homeTeam, awayTeam, date);
  if (sofa) { console.log(`  [Fetch] SofaScore: ${sofa.homeScore}-${sofa.awayScore}`); return sofa; }
  console.log(`  [Fetch] SofaScore: no result`);

  // Final fallback: Gemini with Google Search grounding
  if (process.env.GEMINI_API_KEY) {
    console.log(`  [Fetch] Gemini Search...`);
    const { fetchScoreWithGemini } = await import('./geminiEvaluator');
    const gemini = await fetchScoreWithGemini(homeTeam, awayTeam, date);
    if (gemini) { console.log(`  [Fetch] Gemini: ${gemini.homeScore}-${gemini.awayScore}`); return gemini; }
    console.log(`  [Fetch] Gemini: no result`);
  }

  return null;
}
