// src/lib/scraper/footballsuper.ts
// footballsuper.tips shows one "Football Tip of the Day" (single pick with odds) in server-rendered HTML:
//   <span class="checktimesees">16:30</span>  <span class="checktipcss">Both Teams to Score Yes</span>
//   in <a class="gamelink">Sunderland v Leeds</a> <span class="checkleaguecss">England Premier League</span>
//   <span class="totlasdivs">Total Odd: 1.80</span>
// The page carries no date ("Today"), so the tip is stored under the day it was fetched. The scrape script
// drops a tip whose match was already stored in the last days (the site may still show yesterday's pick).

import { parse } from 'node-html-parser';
import type { ExtScrapedTip } from './tiporacle';

const URL = 'https://www.footballsuper.tips/football-accumulators-tips/football-tips-prediction-of-the-day/';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/** "Both Teams to Score Yes" → "Both Teams to Score" so the shared market evaluator understands it. */
function normalizeMarket(pick: string): string {
  const p = pick.replace(/\s+/g, ' ').trim();
  if (/^both teams to score\s+yes$/i.test(p)) return 'Both Teams to Score';
  if (/^both teams to score\s+no$/i.test(p)) return 'BTTS - No';
  return p;
}

export function parseFootballSuper(html: string, today = new Date().toISOString().slice(0, 10)): ExtScrapedTip[] {
  const root = parse(html);
  const pick = root.querySelector('.checktipcss')?.text.trim() ?? '';
  const matchText = root.querySelector('.checkeventcss a.gamelink')?.text.trim() ?? '';
  const odd = parseFloat((root.querySelector('.totlasdivs')?.text ?? '').replace(/[^\d.]/g, ''));
  const kickoff = root.querySelector('.checktimesees')?.text.trim() ?? '';
  const league = root.querySelector('.checkleaguecss')?.text.trim() ?? '';

  const teams = matchText.split(/\s+v(?:s\.?)?\s+/i).map((t) => t.trim());
  if (!pick || teams.length !== 2 || !teams[0] || !teams[1] || isNaN(odd)) return []; // no odds → cannot track profit

  const market = normalizeMarket(pick);
  return [
    {
      source: 'FOOTBALLSUPER',
      date: today,
      rank: 1,
      homeTeam: teams[0],
      awayTeam: teams[1],
      league,
      market,
      pick: market,
      kickoff,
      odd,
      confidence: null,
      sourceUrl: URL,
    },
  ];
}

export async function scrapeFootballSuperToday(): Promise<ExtScrapedTip[]> {
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
      const res = await fetch(r.url, { headers: r.headers, signal: AbortSignal.timeout(30_000) });
      const body = await res.text();
      if (res.ok && body.includes('checktipcss')) {
        console.log(`  (footballsuper fetched via ${r.name})`);
        return parseFootballSuper(body);
      }
      failures.push(`${r.name}: HTTP ${res.status}, ${body.length}B`);
    } catch (e) {
      failures.push(`${r.name}: ${e instanceof Error ? e.message : e}`);
    }
  }
  throw new Error(`footballsuper: no tip block from any route — ${failures.join(' | ')}`);
}
