// src/lib/services/searchScoreFetcher.ts
// Last-resort score lookup for matches no API/scraper covers (small leagues): a web search through Jina
// (s.jina.ai) whose result snippets are checked, never trusted blindly.
//
// A score is accepted only when at least TWO different websites state the SAME score for this pairing of
// teams on (about) the right date. Tier 1 parses "Team A 1-3 Team B" patterns with regexes. Tier 2 lets a
// non-grounded Gemini call read the snippets, but its answer is verified: the score must literally appear in
// at least two snippets from different sites. Accepted scores are logged to the LlmScore table with their URLs.

import { teamsMatch } from './fstResultFetcher';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-flash-lite-latest';

interface Snippet {
  url: string;
  domain: string;
  text: string; // title + description (+ start of content)
}

interface Score {
  homeScore: number;
  awayScore: number;
}

const domainOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '').split('.').slice(-2).join('.');
  } catch {
    return url;
  }
};

const dayNumber = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / 864e5);

/** All calendar dates mentioned in a text, as day numbers. */
function datesIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2})\b/g)) out.push(dayNumber(+m[3], +m[2], +m[1]));
  for (const m of text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) out.push(dayNumber(+m[1], +m[2], +m[3]));
  for (const m of text.matchAll(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2})\b/gi)) {
    out.push(dayNumber(+m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2]));
  }
  for (const m of text.matchAll(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?,?\s+(20\d{2})\b/gi)) {
    out.push(dayNumber(+m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]));
  }
  return out;
}

/** A text that names dates, none of them within ±1 day of the match date, is about another match. */
function dateOk(text: string, target: number): boolean {
  const dates = datesIn(text);
  return dates.length === 0 || dates.some((d) => Math.abs(d - target) <= 1);
}

const lastWords = (s: string, n: number) => s.trim().split(/\s+/).slice(-n).join(' ');
const firstWords = (s: string, n: number) => s.trim().split(/\s+/).slice(0, n).join(' ');

/** Scores written as "A 1-3 B" or "A - B 1-3" in a text, oriented to (home, away). */
function scoresIn(text: string, home: string, away: string): Score[] {
  const found: Score[] = [];
  const orient = (left: string, right: string, x: number, y: number) => {
    if (teamsMatch(left, home) && teamsMatch(right, away)) found.push({ homeScore: x, awayScore: y });
    else if (teamsMatch(left, away) && teamsMatch(right, home)) found.push({ homeScore: y, awayScore: x });
  };
  // "Team A 1-3 Team B"
  for (const m of text.matchAll(/([^\d\n|]{3,60}?)\s+(\d{1,2})\s*[-–:]\s*(\d{1,2})\s+([^\d\n|(]{3,60})/g)) {
    orient(lastWords(m[1], 4), firstWords(m[4], 4), +m[2], +m[3]);
  }
  // "Team A - Team B 1-3" / "Team A v Team B 1-3"
  for (const m of text.matchAll(/([^\d\n|]{3,40}?)\s+(?:-|–|v|vs\.?)\s+([^\d\n|]{3,40}?)\s+(\d{1,2})\s*[-–:]\s*(\d{1,2})\b/g)) {
    orient(lastWords(m[1], 4), lastWords(m[2], 4), +m[3], +m[4]);
  }
  return found;
}

async function searchSnippets(home: string, away: string, date: string): Promise<Snippet[]> {
  const key = process.env.JINA_API_KEY;
  if (!key) return [];
  const [y, mo, d] = date.split('-').map(Number);
  const q = `${home} ${away} ${d} ${MONTH_NAMES[mo - 1]} ${y} result`;
  try {
    const res = await fetch(`https://s.jina.ai/${encodeURIComponent(q)}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      console.log(`  [Search] Jina HTTP ${res.status}`);
      return [];
    }
    const json = await res.json();
    return (json.data ?? []).slice(0, 10).map((r: any) => ({
      url: String(r.url ?? ''),
      domain: domainOf(String(r.url ?? '')),
      text: [r.title, r.description, String(r.content ?? '').slice(0, 600)].filter(Boolean).join(' \n '),
    }));
  } catch (e) {
    console.log(`  [Search] Jina error: ${e instanceof Error ? e.message : e}`);
    return [];
  }
}

/** Tier 1: regex-parsed scores, accepted when ≥2 distinct domains agree and none disagrees. */
function regexVote(snips: Snippet[], home: string, away: string, target: number): { score: Score; urls: string[] } | null {
  const byScore = new Map<string, { score: Score; domains: Map<string, string> }>();
  for (const s of snips) {
    if (!dateOk(s.text, target)) continue;
    for (const sc of scoresIn(s.text, home, away)) {
      const k = `${sc.homeScore}-${sc.awayScore}`;
      if (!byScore.has(k)) byScore.set(k, { score: sc, domains: new Map() });
      byScore.get(k)!.domains.set(s.domain, s.url);
    }
  }
  const ranked = [...byScore.values()].sort((a, b) => b.domains.size - a.domains.size);
  if (ranked.length === 0 || ranked[0].domains.size < 2) return null;
  if (ranked.length > 1 && ranked[1].domains.size >= 2) return null; // two scores both well supported — ambiguous
  return { score: ranked[0].score, urls: [...ranked[0].domains.values()] };
}

/** Tier 2: Gemini (no tools) reads the snippets; its answer is verified against the raw snippet text. */
async function llmVote(snips: Snippet[], home: string, away: string, date: string, target: number): Promise<{ score: Score; urls: string[] } | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const usable = snips.filter((s) => dateOk(s.text, target));
  if (usable.length < 2) return null;

  const listing = usable.map((s, i) => `[${i + 1}] (${s.domain}) ${s.text.replace(/\s+/g, ' ').slice(0, 700)}`).join('\n');
  const prompt =
    `Below are web search snippets. Using ONLY these snippets, find the final score (full time, including extra time, ` +
    `excluding penalty shootouts) of the football match ${home} (HOME) vs ${away} (AWAY), played on ${date}.\n` +
    `Ignore snippets about other dates or other opponents. Reply with JSON only: ` +
    `{"home": <home goals>, "away": <away goals>, "snippets": [<numbers of snippets that state this score>]} ` +
    `or {"unknown": true} if the snippets do not clearly state it.\n\n${listing}`;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: 200 } }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      console.log(`  [Search] Gemini extraction HTTP ${res.status}`);
      return null;
    }
    const json = await res.json();
    const text: string = (json.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('');
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const ans = JSON.parse(m[0]);
    if (ans.unknown || typeof ans.home !== 'number' || typeof ans.away !== 'number') return null;
    const { home: h, away: a } = ans as { home: number; away: number };
    if (h > 15 || a > 15) return null;

    // Verification: the score must literally appear (in either orientation of the same digits) in ≥2 snippets from
    // different sites, and each such snippet must mention both teams.
    const scoreRe = new RegExp(`\\b${h}\\s*[-–:]\\s*${a}\\b|\\b${a}\\s*[-–:]\\s*${h}\\b`);
    const nameHit = (t: string, n: string) => t.split(/\s+/).some((w) => w.length > 2 && teamsMatch(w, firstWords(n, 1)));
    const support = usable.filter((s) => scoreRe.test(s.text) && nameHit(s.text, home) && nameHit(s.text, away));
    const domains = new Map(support.map((s) => [s.domain, s.url]));
    if (domains.size < 2) {
      console.log(`  [Search] Gemini said ${h}-${a} but only ${domains.size} site(s) state it — rejected`);
      return null;
    }
    return { score: { homeScore: h, awayScore: a }, urls: [...domains.values()] };
  } catch (e) {
    console.log(`  [Search] Gemini extraction error: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

export async function fetchScoreViaSearch(home: string, away: string, date: string): Promise<Score | null> {
  // Never look for matches that may still be running or only just ended.
  if (date >= new Date().toISOString().slice(0, 10)) return null;
  const snips = await searchSnippets(home, away, date);
  if (snips.length === 0) return null;
  const [y, mo, d] = date.split('-').map(Number);
  const target = dayNumber(y, mo, d);

  let via = 'jina-regex';
  let vote = regexVote(snips, home, away, target);
  if (!vote) {
    vote = await llmVote(snips, home, away, date, target);
    via = `jina+${GEMINI_MODEL}`;
  }
  if (!vote) {
    console.log('  [Search] no two sites agree — keeping PENDING');
    return null;
  }

  console.log(`  [Search] ${vote.score.homeScore}-${vote.score.awayScore} confirmed by ${vote.urls.length} sites (${via})`);
  try {
    const { prisma } = await import('../db/prisma');
    await prisma.llmScore.create({
      data: {
        homeTeam: home,
        awayTeam: away,
        date,
        homeScore: vote.score.homeScore,
        awayScore: vote.score.awayScore,
        sources: JSON.stringify(vote.urls.slice(0, 6)),
        models: JSON.stringify([via]),
      },
    });
  } catch (e) {
    console.log(`  [Search] could not write audit row: ${e instanceof Error ? e.message : e}`);
  }
  return vote.score;
}
