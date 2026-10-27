// src/lib/services/fstResultFetcher.ts
// Fetches match results: TheSportsDB → ESPN → SofaScore

// Compact names that sources spell very differently.
const TEAM_ALIASES: Record<string, string> = {
  hearts: 'heartofmidlothian',
  psg: 'parissaintgermain',
  parissg: 'parissaintgermain',
  parissaintgermain: 'parissaintgermain',
  psvii: 'jongpsv',
  psv2: 'jongpsv',
  bayernmunchen: 'bayernmunich',
  manutd: 'manchesterunited',
  mancity: 'manchestercity',
  spurs: 'tottenhamhotspur',
  wolves: 'wolverhamptonwanderers',
  inter: 'internazionale',
  intermilan: 'internazionale',
};

// Club-name filler words that differ between sources ("Celta de Vigo" vs "Celta Vigo").
const TEAM_STOPWORDS = new Set(['fc', 'cf', 'afc', 'sc', 'fk', 'sk', 'cd', 'ud', 'rc', 'de', 'of', 'the', 'club']);

function stripMarks(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normalize(name: string): string {
  const compact = stripMarks(name).toLowerCase().replace(/[^a-z0-9]/g, '');
  return TEAM_ALIASES[compact] ?? compact;
}

function nameTokens(name: string): string[] {
  return stripMarks(name)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !TEAM_STOPWORDS.has(t));
}

export function teamsMatch(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  // Token fallback: every meaningful word of the shorter name matches a word of the longer one.
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  const [small, big] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return small.length > 0 && small.every((t) => big.some((u) => tokenMatch(t, u)));
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

/** Two words of a club name that plausibly denote the same word: equal, initial ("O." / Oriente), prefix ("Uni" / Universitario), or a small spelling difference. */
function tokenMatch(x: string, y: string): boolean {
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length === 1) return long.startsWith(short);
  if (short.length >= 3 && long.startsWith(short)) return true;
  return short.length >= 6 && Math.abs(x.length - y.length) <= 1 && editDistance(x, y) <= 2;
}

// ── [NameMiss] diagnostics (log only, never changes resolving) ───────────────
// When a source has a FINISHED match on the right date in which exactly ONE of the tip's teams matches, the other
// name is probably spelled differently there — worth an alias. At most 5 distinct lines per tip.
let nameMissLogged = 0;
const nameMissSeen = new Set<string>();

export function resetNameMissLog(): void {
  nameMissLogged = 0;
  nameMissSeen.clear();
}

export function noteNameMiss(tipHome: string, tipAway: string, srcHome: string, srcAway: string, source: string, date: string): void {
  if (nameMissLogged >= 5) return;
  const straight = Number(teamsMatch(srcHome, tipHome)) + Number(teamsMatch(srcAway, tipAway));
  const swapped = Number(teamsMatch(srcHome, tipAway)) + Number(teamsMatch(srcAway, tipHome));
  if (straight === 2 || swapped === 2) return; // full match, nothing missed
  if (straight !== 1 && swapped !== 1) return; // neither team matched: unrelated match
  const line = `  [NameMiss] tip: ${tipHome} vs ${tipAway} | izvor: ${srcHome} vs ${srcAway} (${source}, ${date})`;
  if (nameMissSeen.has(line)) return;
  nameMissSeen.add(line);
  nameMissLogged++;
  console.log(line);
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

function findInSportsDBEvents(events: any[], homeTeam: string, awayTeam: string, date = ''): MatchScore | null {
  for (const ev of events) {
    if (!isFinished(ev.strStatus ?? '')) continue;
    const evHome = ev.strHomeTeam ?? '';
    const evAway = ev.strAwayTeam ?? '';
    noteNameMiss(homeTeam, awayTeam, evHome, evAway, 'TheSportsDB', date);
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

// TheSportsDB's old free key "3" was permanently disabled (403); "123" is the current public test key.
const SPORTSDB_KEY = '123';

// The public key is rate limited (~30 requests/minute, Cloudflare 1015 beyond that) — space the calls out.
let lastSportsDbCall = 0;
async function sportsDbJson(url: string): Promise<any> {
  const wait = lastSportsDbCall + 2100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastSportsDbCall = Date.now();
  return fetchJson(url);
}

/** Query strings for searchevents: full names, filler words dropped, and first significant word only. */
function sportsDbQueries(homeTeam: string, awayTeam: string): string[] {
  const first = (n: string) => nameTokens(n)[0] ?? n;
  const stripped = (n: string) => nameTokens(n).join(' ') || n;
  const variants = [
    [homeTeam, awayTeam],
    [stripped(homeTeam), stripped(awayTeam)],
    [first(homeTeam), first(awayTeam)],
  ];
  const out = new Set<string>();
  for (const [h, a] of variants) {
    out.add(`${h} vs ${a}`);
    out.add(`${a} vs ${h}`);
  }
  return [...out].map((q) => encodeURIComponent(q));
}

async function fetchFromSportsDB(homeTeam: string, awayTeam: string, date: string): Promise<MatchScore | null> {
  const base = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_KEY}`;
  const dayJson = await sportsDbJson(`${base}/eventsday.php?d=${date}&s=Soccer`);
  if (dayJson) {
    const found = findInSportsDBEvents(dayJson.events ?? [], homeTeam, awayTeam, date);
    if (found) return found;
  }

  // Some sources date a tip one day after the match — accept the previous day too.
  const prev = new Date(Date.parse(date) - 864e5).toISOString().slice(0, 10);
  for (const query of sportsDbQueries(homeTeam, awayTeam)) {
    const json = await sportsDbJson(`${base}/searchevents.php?e=${query}`);
    if (!json) continue;
    for (const day of [date, prev]) {
      const found = findInSportsDBEvents((json.event ?? []).filter((e: any) => e.dateEvent === day), homeTeam, awayTeam, day);
      if (found) return found;
    }
  }
  return null;
}

// ── ESPN ─────────────────────────────────────────────────────────────────────

const ESPN_LEAGUES = [
  'all',
  'eng.1', 'esp.1', 'ger.1', 'ita.1', 'fra.1',
  'ned.1', 'por.1', 'tur.1', 'bel.1', 'sco.1',
  'usa.1', 'gre.1', 'aut.1',
  'uefa.champions', 'uefa.europa', 'uefa.europa.conf',
];

async function fetchFromESPNLeagues(homeTeam: string, awayTeam: string, date: string, leagues: string[]): Promise<MatchScore | null> {
  const d = date.replace(/-/g, '');
  const results = await Promise.allSettled(
    leagues.map((league) =>
      fetchJson(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard?dates=${d}&limit=500`,
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
      noteNameMiss(homeTeam, awayTeam, homeName, awayName, 'ESPN', date);
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

// ── SportAPI7 (RapidAPI → SofaScore data) ────────────────────────────────────
// SofaScore-compatible data via RapidAPI proxy — works from GitHub Actions IPs.
// Subscribe free at rapidapi.com/rapidsportapi/api/sportapi7 → add RAPIDAPI_KEY

async function fetchFromSportApi7(homeTeam: string, awayTeam: string, date: string): Promise<MatchScore | null> {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) return null;

  const json = await fetchJson(
    `https://sportapi7.p.rapidapi.com/api/v1/sport/football/scheduled-events/${date}`,
    15_000,
    {
      'x-rapidapi-key': apiKey,
      'x-rapidapi-host': 'sportapi7.p.rapidapi.com',
    }
  );
  if (!json) return null;

  const events: any[] = json.events ?? [];
  console.log(`  [SportAPI7] Total events: ${events.length}`);
  if (events.length > 0) {
    const sample = events[0];
    console.log(`  [SportAPI7] Sample: ${sample.homeTeam?.name} vs ${sample.awayTeam?.name}, status code: ${sample.status?.code}`);
  }

  for (const event of events) {
    const statusCode: number = event.status?.code ?? 0;
    const evHome: string = event.homeTeam?.name ?? '';
    const evAway: string = event.awayTeam?.name ?? '';
    const homeOk = teamsMatch(evHome, homeTeam) || teamsMatch(evHome, awayTeam);
    const awayOk = teamsMatch(evAway, awayTeam) || teamsMatch(evAway, homeTeam);

    // Log when we find the match (regardless of status)
    if (homeOk && awayOk) {
      console.log(`  [SportAPI7] Found match: ${evHome} vs ${evAway}, status: ${statusCode}, score: ${event.homeScore?.current}-${event.awayScore?.current}`);
    }

    if (statusCode !== 100 && statusCode !== 110 && statusCode !== 120) continue;
    if (!homeOk || !awayOk) continue;

    const hs = event.homeScore?.current ?? event.homeScore?.normaltime;
    const as_ = event.awayScore?.current ?? event.awayScore?.normaltime;
    if (hs === undefined || hs === null || as_ === undefined || as_ === null) continue;

    if (teamsMatch(evHome, homeTeam)) return { homeScore: hs, awayScore: as_ };
    return { homeScore: as_, awayScore: hs };
  }
  return null;
}

// ── API-Football (api-sports.io) ──────────────────────────────────────────────
// 100 free requests/day — use as fallback only

async function fetchFromESPN(homeTeam: string, awayTeam: string, date: string): Promise<MatchScore | null> {
  const found = await fetchFromESPNLeagues(homeTeam, awayTeam, date, ESPN_LEAGUES);
  if (found) return found;
  // Some sources date a tip one day after the match was played (scraped late) — look at the day before too.
  const prev = new Date(Date.parse(date) - 864e5).toISOString().slice(0, 10);
  return fetchFromESPNLeagues(homeTeam, awayTeam, prev, ['all']);
}

async function fetchFromApiFootball(homeTeam: string, awayTeam: string, date: string): Promise<MatchScore | null> {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) return null;

  const json = await fetchJson(
    `https://v3.football.api-sports.io/fixtures?date=${date}&status=FT-AET-PEN`,
    15_000,
    { 'x-apisports-key': apiKey }
  );
  if (!json) return null;

  for (const item of json.response ?? []) {
    const evHome: string = item.teams?.home?.name ?? '';
    const evAway: string = item.teams?.away?.name ?? '';
    const homeOk = teamsMatch(evHome, homeTeam) || teamsMatch(evHome, awayTeam);
    const awayOk = teamsMatch(evAway, awayTeam) || teamsMatch(evAway, homeTeam);
    if (!homeOk || !awayOk) continue;

    const hs = item.goals?.home ?? item.score?.fulltime?.home;
    const as_ = item.goals?.away ?? item.score?.fulltime?.away;
    if (hs === null || hs === undefined || as_ === null || as_ === undefined) continue;

    if (teamsMatch(evHome, homeTeam)) return { homeScore: hs, awayScore: as_ };
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

/**
 * Kickoff (ms) from a tip date + "HH:MM". The clock time is read as UTC on purpose: the sources publish local times (UTC+1/+2),
 * so this is later than the real kickoff, which keeps the "match is over" estimate on the safe side.
 */
export function kickoffMsFrom(date: string, hhmm?: string | null): number | undefined {
  const m = (hhmm ?? '').match(/^(\d{1,2}):(\d{2})/);
  return m ? Date.parse(`${date}T${m[1].padStart(2, '0')}:${m[2]}:00Z`) : undefined;
}

export async function fetchScoreFromSportsDB(
  homeTeam: string,
  awayTeam: string,
  date: string,
  kickoffMs?: number
): Promise<MatchScore | null> {
  resetNameMissLog();
  console.log(`  [Fetch] TheSportsDB...`);
  const sportsDb = await fetchFromSportsDB(homeTeam, awayTeam, date);
  if (sportsDb) { console.log(`  [Fetch] TheSportsDB: ${sportsDb.homeScore}-${sportsDb.awayScore}`); return sportsDb; }
  console.log(`  [Fetch] TheSportsDB: no result`);

  console.log(`  [Fetch] Zulubet...`);
  const { findZulubetScore } = await import('../scraper/zulubet');
  const zulu = await findZulubetScore(homeTeam, awayTeam, date).catch(() => null);
  if (zulu) { console.log(`  [Fetch] Zulubet: ${zulu.homeScore}-${zulu.awayScore}`); return zulu; }
  console.log(`  [Fetch] Zulubet: no result`);

  console.log(`  [Fetch] ESPN (${ESPN_LEAGUES.length} leagues parallel)...`);
  const espn = await fetchFromESPN(homeTeam, awayTeam, date);
  if (espn) { console.log(`  [Fetch] ESPN: ${espn.homeScore}-${espn.awayScore}`); return espn; }
  console.log(`  [Fetch] ESPN: no result`);

  if (process.env.SPORTSAPIPRO_KEY) {
    console.log(`  [Fetch] SportsAPIPro...`);
    const { fetchScoreFromSportsApiPro } = await import('./sportsApiProFetcher');
    const sap = await fetchScoreFromSportsApiPro(homeTeam, awayTeam, date, kickoffMs);
    if (sap) { console.log(`  [Fetch] SportsAPIPro: ${sap.homeScore}-${sap.awayScore}`); return sap; }
    console.log(`  [Fetch] SportsAPIPro: no result`);
  }

  if (process.env.LIVEFOOTBALLAPI_KEY) {
    console.log(`  [Fetch] LiveFootballAPI...`);
    const { fetchScoreFromLiveFootballApi } = await import('./liveFootballApiFetcher');
    const lfa = await fetchScoreFromLiveFootballApi(homeTeam, awayTeam, date, kickoffMs);
    if (lfa) { console.log(`  [Fetch] LiveFootballAPI: ${lfa.homeScore}-${lfa.awayScore}`); return lfa; }
    console.log(`  [Fetch] LiveFootballAPI: no result`);
  }

  console.log(`  [Fetch] SportAPI7 (RapidAPI)...`);
  const sportApi7 = await fetchFromSportApi7(homeTeam, awayTeam, date);
  if (sportApi7) { console.log(`  [Fetch] SportAPI7: ${sportApi7.homeScore}-${sportApi7.awayScore}`); return sportApi7; }
  console.log(`  [Fetch] SportAPI7: no result`);

  console.log(`  [Fetch] SofaScore...`);
  const sofa = await fetchFromSofaScore(homeTeam, awayTeam, date);
  if (sofa) { console.log(`  [Fetch] SofaScore: ${sofa.homeScore}-${sofa.awayScore}`); return sofa; }
  console.log(`  [Fetch] SofaScore: no result`);

  if (process.env.API_FOOTBALL_KEY) {
    console.log(`  [Fetch] API-Football...`);
    const apiFb = await fetchFromApiFootball(homeTeam, awayTeam, date);
    if (apiFb) { console.log(`  [Fetch] API-Football: ${apiFb.homeScore}-${apiFb.awayScore}`); return apiFb; }
    console.log(`  [Fetch] API-Football: no result`);
  }

  // Web search (Jina) — accepted only when two different sites state the same score.
  if (process.env.JINA_API_KEY) {
    console.log(`  [Fetch] Web search...`);
    const { fetchScoreViaSearch } = await import('./searchScoreFetcher');
    const found = await fetchScoreViaSearch(homeTeam, awayTeam, date, kickoffMs);
    if (found) { console.log(`  [Fetch] Web search: ${found.homeScore}-${found.awayScore}`); return found; }
    console.log(`  [Fetch] Web search: no result`);
  }

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
