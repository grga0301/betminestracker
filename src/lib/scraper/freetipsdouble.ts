// src/lib/scraper/freetipsdouble.ts
// freetips.com "Daily Double": two football picks per day, stored as one 2-leg ticket (like the FootyAccumulators trebles).
// Server-rendered card, one <li> per leg:
//   <span class="tm" data-bettime="2026/10/25 02:00:00 PM">  <div class="match-name"><span>Both Teams to Score</span>
//   <span class="m-name">Man Utd v Bournemouth</span></div>  <span class="plr-name">Yes (8/15)</span>
//   <span class="ods" data-ods="1.53">      …      <span class="tot-ods">3.53</span>
// freetips.com answers 403 to GitHub's datacenter IPs, so the direct request falls back to r.jina.ai (raw HTML).

import { parse } from 'node-html-parser';
import type { ExtLeg, ExtScrapedTip } from './tiporacle';

const URL = 'https://www.freetips.com/betting/daily-double-tips/';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Translates FreeTips wording into the vocabulary of extTipEvaluator ("Home Win", "BTTS - Yes", "Over 2.5 Goals",
 * "Home Win & BTTS - Yes" …). Anything unknown is passed through, which leaves that leg PENDING instead of guessing.
 */
export function mapDoubleMarket(rawMarket: string, rawPick: string, home: string, away: string, reason = ''): string {
  const market = rawMarket.toLowerCase();
  const pick = rawPick.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+/g, ' ').trim(); // drop "(8/15)"
  const side = (name: string): 'Home' | 'Away' | 'Draw' | null => {
    const n = norm(name.replace(/\([^)]*\)/g, ''));
    if (n === 'draw' || n === 'x') return 'Draw';
    if (n === 'home' || n === 'homewin' || n === '1' || (norm(home) && (n === norm(home) || n.includes(norm(home)) || norm(home).includes(n)))) return 'Home';
    if (n === 'away' || n === 'awaywin' || n === '2' || (norm(away) && (n === norm(away) || n.includes(norm(away)) || norm(away).includes(n)))) return 'Away';
    return null;
  };
  const sideLabel = (s: 'Home' | 'Away' | 'Draw') => (s === 'Draw' ? 'Draw' : `${s} Win`);
  const btts = (v: string) => (/^yes$/i.test(v) ? 'BTTS - Yes' : /^no$/i.test(v) ? 'BTTS - No' : null);

  // Handicap: "Roma (-1)" must NOT be read as a plain win — keep the handicap ("Home -1")
  if (/handicap/.test(market)) {
    const hc = pick.match(/\(([+-]\d+(?:\.\d+)?)\)/)?.[1];
    const s = side(pick);
    return hc && (s === 'Home' || s === 'Away') ? `${s} ${hc}` : `${rawMarket}: ${pick}`;
  }
  // "Result/Both Teams to Score": "Barcelona & Yes"
  if (/result/.test(market) && /both teams/.test(market)) {
    const [a, b] = pick.split(/\s*&\s*/);
    const s = a ? side(a) : null;
    const y = b ? btts(b.trim()) : null;
    return s && y ? `${sideLabel(s)} & ${y}` : `${rawMarket}: ${pick}`;
  }
  if (/both teams to score/.test(market) || market === 'btts') {
    return btts(pick) ?? `${rawMarket}: ${pick}`;
  }
  // Over/Under: the line is in the market ("Over/Under 2.5 Goals") or the pick ("Over 2.5")
  if (/over|under|total goals/.test(market) || /^(over|under)\b/i.test(pick)) {
    const dir = /under/i.test(pick) ? 'Under' : /over/i.test(pick) ? 'Over' : null;
    // The line is in the market/pick, or ("Alternative Total Goals: Over") only in the reason text ("seen over 3.5 goals …")
    const line =
      `${market} ${pick}`.match(/(\d+(?:\.\d+)?)\s*(?:goals?)?/)?.[1] ??
      (dir ? reason.match(new RegExp(dir + '\\s*(\\d+\\.?\\d*)', 'i'))?.[1] : undefined);
    if (dir && line) return `${dir} ${line} Goals`;
  }
  // Double chance: "Arsenal or Draw", "Draw or Chelsea", "Arsenal or Chelsea"
  const dc = pick.split(/\s+or\s+/i);
  if (dc.length === 2 && /double chance/.test(market)) {
    const sides = dc.map((x) => side(x.trim()));
    if (sides[0] && sides[1]) {
      const set = new Set(sides);
      if (set.has('Home') && set.has('Draw')) return 'Home or Draw';
      if (set.has('Away') && set.has('Draw')) return 'Draw or Away';
      if (set.has('Home') && set.has('Away')) return 'Home or Away';
    }
  }
  // Plain match result
  if (/result|1x2|match winner|full time/.test(market) || market === 'win') {
    const s = side(pick);
    if (s) return sideLabel(s);
  }
  return `${rawMarket}: ${pick}`;
}

export function parseFreeTipsDouble(html: string, now = Date.now()): ExtScrapedTip[] {
  const root = parse(html);
  const items = root.querySelectorAll('li').filter((li) => li.querySelector('.betacctime') && li.querySelector('.m-name'));
  const legs: ExtLeg[] = [];
  const odds: number[] = [];

  for (const li of items) {
    const bet = li.querySelector('.tm')?.getAttribute('data-bettime')?.match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{1,2}):(\d{2}):\d{2}\s*(AM|PM)/i);
    const names = (li.querySelector('.m-name')?.text ?? '').split(/\s+v(?:s\.?)?\s+/i).map((t) => t.trim());
    const rawMarket = li.querySelector('.match-name span')?.text.trim() ?? '';
    const rawPick = li.querySelector('.plr-name')?.text.trim() ?? '';
    const reason = li.querySelector('.reasonForTipM p')?.text.trim() ?? '';
    const odd = parseFloat(li.querySelector('.ods')?.getAttribute('data-ods') ?? li.querySelector('.ods')?.text ?? '');
    if (!bet || names.length !== 2 || !rawPick || isNaN(odd)) continue;

    let hour = parseInt(bet[4], 10) % 12;
    if (/pm/i.test(bet[6])) hour += 12;
    // The site shows UK time; reading it as UTC is at most 1 h late, which only makes "match is over" estimates safer.
    const kickoffIso = new Date(Date.UTC(+bet[1], +bet[2] - 1, +bet[3], hour, +bet[5])).toISOString();
    legs.push({
      homeTeam: names[0],
      awayTeam: names[1],
      market: mapDoubleMarket(rawMarket, rawPick, names[0], names[1], reason),
      kickoffIso,
      status: 'PENDING',
      homeScore: null,
      awayScore: null,
    });
    odds.push(odd);
  }
  if (legs.length === 0) return [];

  const order = legs.map((_, i) => i).sort((a, b) => legs[a].kickoffIso.localeCompare(legs[b].kickoffIso));
  const sorted = order.map((i) => legs[i]);
  // Only tickets whose first match has not started: a tip first seen later proves nothing.
  if (Date.parse(sorted[0].kickoffIso) <= now) {
    console.log(`  [FT double] first match already started (${sorted[0].kickoffIso}) — not stored`);
    return [];
  }

  const tot = parseFloat(root.querySelector('.tot-ods')?.text ?? '');
  const odd = !isNaN(tot) ? tot : Math.round(odds.reduce((a, b) => a * b, 1) * 100) / 100;
  const first = sorted[0];
  const base = {
    source: 'FREETIPS_DOUBLE' as const,
    date: first.kickoffIso.slice(0, 10),
    rank: 1,
    homeTeam: first.homeTeam,
    awayTeam: first.awayTeam,
    league: '',
    kickoff: first.kickoffIso.slice(11, 16),
    odd,
    confidence: null,
    sourceUrl: URL,
  };
  if (sorted.length === 1) return [{ ...base, market: first.market, pick: first.market }];
  const label = `${sorted.length}-fold: ${sorted.map((l) => l.market).filter((v, i, a) => a.indexOf(v) === i).join(' / ')}`;
  return [{ ...base, market: label, pick: label, legs: sorted }];
}

/** `includeStarted` stores a ticket even though its first match has begun (manual one-off backfill only). */
export async function scrapeFreeTipsDoubleToday(includeStarted = false): Promise<ExtScrapedTip[]> {
  const jinaKey = process.env.JINA_API_KEY;
  const routes = [
    { name: 'direct', url: URL, headers: { 'User-Agent': UA, 'Accept-Language': 'en' } as Record<string, string> },
    {
      name: 'r.jina.ai',
      url: `https://r.jina.ai/${URL}`,
      headers: { 'X-Return-Format': 'html', ...(jinaKey ? { Authorization: `Bearer ${jinaKey}` } : {}) } as Record<string, string>,
    },
  ];
  const failures: string[] = [];
  for (const r of routes) {
    try {
      const res = await fetch(r.url, { headers: r.headers, signal: AbortSignal.timeout(45_000) });
      const body = await res.text();
      if (res.ok && body.includes('m-name')) {
        console.log(`  (freetips double fetched via ${r.name})`);
        return parseFreeTipsDouble(body, includeStarted ? 0 : Date.now());
      }
      failures.push(`${r.name}: HTTP ${res.status}, ${body.length}B`);
    } catch (e) {
      failures.push(`${r.name}: ${e instanceof Error ? e.message : e}`);
    }
  }
  throw new Error(`freetips double: no tip card from any route — ${failures.join(' | ')}`);
}
