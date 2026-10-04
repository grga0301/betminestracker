// src/lib/scraper/forebet.ts
// Forebet publishes a 1X2 prediction (with probabilities) for hundreds of matches per day.
// We turn that into a short list: the N most probable picks whose odds are still worth tracking.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parse } from 'node-html-parser';
import type { ExtScrapedTip } from './tiporacle';

const execFileAsync = promisify(execFile);
const BASE = 'https://www.forebet.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export const FOREBET_MIN_ODD = 1.3;
export const FOREBET_PICKS_PER_DAY = 3;

export interface ForebetRow {
  homeTeam: string;
  awayTeam: string;
  league: string;
  date: string; // YYYY-MM-DD
  kickoff: string; // HH:MM
  probs: [number, number, number]; // 1, X, 2
  pick: '1' | 'X' | '2';
  odd: number;
  url: string;
  score: { homeScore: number; awayScore: number } | null;
}

export function parseForebetRows(html: string): ForebetRow[] {
  const root = parse(html);
  const rows: ForebetRow[] = [];

  for (const el of root.querySelectorAll('div.rcnt')) {
    const homeTeam = el.querySelector('.homeTeam')?.text.trim();
    const awayTeam = el.querySelector('.awayTeam')?.text.trim();
    const dateText = el.querySelector('.date_bah')?.text.trim(); // 04/10/2026 19:00
    const href = el.querySelector('a.tnmscn')?.getAttribute('href');
    const pick = el.querySelector('.forepr')?.text.trim();
    const probs = el.querySelectorAll('.fprc span').map((s) => parseInt(s.text, 10));
    const odd = parseFloat(el.querySelector('.prmod .lscrsp')?.text ?? '');

    if (!homeTeam || !awayTeam || !dateText || !href) continue;
    if (pick !== '1' && pick !== 'X' && pick !== '2') continue;
    if (probs.length !== 3 || probs.some(isNaN) || isNaN(odd)) continue;

    const m = dateText.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2})/);
    if (!m) continue;

    const league = el.querySelector('.flsc')?.getAttribute('onclick')?.match(/'[^']*','([^']*)'/)?.[1] ?? '';

    const scoreText = el.querySelector('.l_scr')?.text.trim() ?? '';
    const sm = scoreText.match(/^(\d+)\s*-\s*(\d+)$/);

    rows.push({
      homeTeam,
      awayTeam,
      league,
      date: `${m[3]}-${m[2]}-${m[1]}`,
      kickoff: m[4],
      probs: probs as [number, number, number],
      pick,
      odd,
      url: BASE + href,
      score: sm ? { homeScore: +sm[1], awayScore: +sm[2] } : null,
    });
  }
  return rows;
}

export function selectForebetPicks(rows: ForebetRow[], n = FOREBET_PICKS_PER_DAY): ForebetRow[] {
  const prob = (r: ForebetRow) => r.probs[r.pick === '1' ? 0 : r.pick === 'X' ? 1 : 2];
  return rows
    .filter((r) => r.odd >= FOREBET_MIN_ODD)
    .sort((a, b) => prob(b) - prob(a))
    .slice(0, n);
}

// Forebet answers 403 to Node's fetch (TLS fingerprint) but not to curl, so shell out to curl.
async function fetchHtml(url: string): Promise<string> {
  const { stdout } = await execFileAsync(
    'curl',
    ['-sL', '--max-time', '30', '-A', UA, '-H', 'Accept-Language: en', '-w', '\n%{http_code}', url],
    { maxBuffer: 20 * 1024 * 1024 }
  );
  const i = stdout.lastIndexOf('\n');
  const code = stdout.slice(i + 1).trim();
  if (code !== '200') throw new Error(`Forebet HTTP ${code} for ${url}`);
  return stdout.slice(0, i);
}

/** Today's picks (only matches that have not started yet). */
export async function scrapeForebetToday(): Promise<ExtScrapedTip[]> {
  const html = await fetchHtml(`${BASE}/en/football-tips-and-predictions-for-today`);
  const upcoming = parseForebetRows(html).filter((r) => !r.score);
  return selectForebetPicks(upcoming).map((r, i) => toTip(r, i + 1));
}

/** Rows for an arbitrary past/future date — used for backtesting a selection rule. */
export async function fetchForebetDay(date: string): Promise<ForebetRow[]> {
  return parseForebetRows(await fetchHtml(`${BASE}/en/football-predictions/predictions-1x2/${date}`));
}

/** Final score from a Forebet match page, or null if the match is not finished. */
export async function fetchForebetResult(
  url: string
): Promise<{ homeScore: number; awayScore: number } | null> {
  const html = await fetchHtml(url);
  const status = html.match(/class="lmin_mp">([^<]*)</)?.[1]?.trim();
  if (status !== 'FT') return null;
  const m = html.match(/<b class="l_scr">\s*(\d+)\s*-\s*(\d+)\s*<\/b>/);
  return m ? { homeScore: +m[1], awayScore: +m[2] } : null;
}

function toTip(r: ForebetRow, rank: number): ExtScrapedTip {
  const side = r.pick === '1' ? r.homeTeam : r.pick === '2' ? r.awayTeam : 'Draw';
  return {
    source: 'FOREBET',
    date: r.date,
    rank,
    homeTeam: r.homeTeam,
    awayTeam: r.awayTeam,
    league: r.league,
    market: r.pick === '1' ? 'Home Win' : r.pick === '2' ? 'Away Win' : 'Draw',
    pick: side,
    kickoff: r.kickoff,
    odd: r.odd,
    confidence: r.probs[r.pick === '1' ? 0 : r.pick === 'X' ? 1 : 2],
    sourceUrl: r.url,
  };
}
