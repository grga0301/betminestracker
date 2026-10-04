// src/lib/scraper/zulubet.ts
// zulubet.com lists every match of a day with 1X2 probabilities, a tip, average 1X2 odds and — once played —
// the final score. Pages exist per date (tips-DD-MM-YYYY.html), so history is available for free.
// We turn the bulk list into a short list: the most probable single-outcome picks priced 1.70–2.20.

import { parse, type HTMLElement } from 'node-html-parser';
import type { ExtScrapedTip } from './tiporacle';

const BASE = 'https://www.zulubet.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export const ZULU_MIN_ODD = 1.7;
export const ZULU_MAX_ODD = 2.2;
export const ZULU_PICKS_PER_DAY = 3;

export interface ZuluRow {
  kickoffIso: string; // UTC
  league: string;
  homeTeam: string;
  awayTeam: string;
  probs: [number, number, number]; // 1, X, 2 in %
  tip: string; // 1, X, 2, 12, 1X, X2 …
  odds: [number, number, number]; // 1, X, 2
  score: { homeScore: number; awayScore: number } | null;
}

export function parseZulubet(html: string): ZuluRow[] {
  const rows: ZuluRow[] = [];

  for (const tr of parse(html).querySelectorAll('tr')) {
    // direct <td> children only — the probability cell contains a nested table
    const cells = tr.childNodes.filter((n) => (n as HTMLElement).rawTagName === 'td') as HTMLElement[];
    if (cells.length < 13 || !cells[1].querySelector('img.flags')) continue;

    // upcoming pages link the match name, past pages show plain text
    const match = cells[1].text.replace(/\s+/g, ' ').trim();
    const teams = match.split(' - ');
    const user = tr.innerHTML.match(/mf_usertime\('(\d{2})\/(\d{2})\/(\d{4}), (\d{2}):(\d{2})'\)/);
    const probs = tr.querySelectorAll('td.prediction_full').slice(0, 3).map((e) => parseInt(e.text, 10));
    const odds = tr.querySelectorAll('td.aver_odds_full').map((e) => parseFloat(e.text));
    if (!user || teams.length !== 2 || probs.length !== 3 || odds.length !== 3) continue;
    if (probs.some(isNaN) || odds.some(isNaN)) continue;

    // The tip is the bold value in the cell right after the three probability cells.
    const tip = tr.querySelector('td b')?.text.trim() ?? '';
    const sm = cells[12].text.trim().match(/^(\d+):(\d+)$/);

    rows.push({
      // mf_usertime holds MM/DD/YYYY, HH:MM in UTC
      kickoffIso: `${user[3]}-${user[1]}-${user[2]}T${user[4]}:${user[5]}:00.000Z`,
      league: tr.querySelector('img.flags')?.getAttribute('title') ?? '',
      homeTeam: teams[0].trim(),
      awayTeam: teams.slice(1).join(' - ').trim(),
      probs: probs as [number, number, number],
      tip,
      odds: odds as [number, number, number],
      score: sm ? { homeScore: +sm[1], awayScore: +sm[2] } : null,
    });
  }
  return rows;
}

const idx = (tip: string) => (tip === '1' ? 0 : tip === 'X' ? 1 : 2);

/** Single-outcome tips (1 / X / 2) priced in range, most probable first. */
export function selectZuluPicks(rows: ZuluRow[], n = ZULU_PICKS_PER_DAY): ZuluRow[] {
  return rows
    .filter((r) => ['1', 'X', '2'].includes(r.tip))
    .filter((r) => r.odds[idx(r.tip)] >= ZULU_MIN_ODD && r.odds[idx(r.tip)] <= ZULU_MAX_ODD)
    .sort((a, b) => b.probs[idx(b.tip)] - a.probs[idx(a.tip)])
    .slice(0, n);
}

const dayCache = new Map<string, Promise<ZuluRow[]>>();

/** One request per date per process, so resolving many pending tips stays polite. */
export function fetchZulubetDay(date: string): Promise<ZuluRow[]> {
  let p = dayCache.get(date);
  if (!p) {
    const [y, m, d] = date.split('-');
    p = fetch(`${BASE}/tips-${d}-${m}-${y}.html`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(15000),
    }).then(async (res) => {
      if (!res.ok) throw new Error(`zulubet HTTP ${res.status} for ${date}`);
      return parseZulubet(await res.text());
    });
    dayCache.set(date, p);
    p.catch(() => dayCache.delete(date)); // don't cache failures
  }
  return p;
}

function toTip(r: ZuluRow, rank: number): ExtScrapedTip {
  const i = idx(r.tip);
  const kick = new Date(r.kickoffIso);
  return {
    source: 'ZULUBET',
    date: r.kickoffIso.slice(0, 10),
    rank,
    homeTeam: r.homeTeam,
    awayTeam: r.awayTeam,
    league: r.league,
    market: i === 0 ? 'Home Win' : i === 2 ? 'Away Win' : 'Draw',
    pick: i === 0 ? r.homeTeam : i === 2 ? r.awayTeam : 'Draw',
    kickoff: kick.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zagreb' }),
    odd: r.odds[i],
    confidence: r.probs[i],
    sourceUrl: `${BASE}/`,
  };
}

/** First-seen picks for today's matches that have not started yet (hourly job; unique key keeps the first). */
export async function scrapeZulubetToday(): Promise<ExtScrapedTip[]> {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (await fetchZulubetDay(today)).filter(
    (r) => !r.score && Date.parse(r.kickoffIso) > Date.now() && r.kickoffIso.startsWith(today)
  );
  return selectZuluPicks(upcoming).map((r, i) => toTip(r, i + 1));
}

/** Final score for a tip, read from Zulubet's own date pages (kickoff day and the next one). */
export async function fetchZulubetScore(
  homeTeam: string,
  awayTeam: string,
  date: string
): Promise<{ homeScore: number; awayScore: number } | null> {
  const next = new Date(Date.parse(date) + 864e5).toISOString().slice(0, 10);
  for (const day of [date, next]) {
    const rows = await fetchZulubetDay(day).catch(() => []);
    const hit = rows.find((r) => r.homeTeam === homeTeam && r.awayTeam === awayTeam && r.score);
    if (hit?.score) return hit.score;
  }
  return null;
}

/** Winner of a finished match as 1 / X / 2. */
export const outcome = (s: { homeScore: number; awayScore: number }) =>
  s.homeScore > s.awayScore ? '1' : s.homeScore < s.awayScore ? '2' : 'X';

export const pickIndex = idx;
export { toTip as zuluRowToTip };
