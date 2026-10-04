// src/lib/scraper/footyaccumulators.ts
// footyaccumulators.com publishes one "Bet of the Day" for the next day. The page is a Next.js app
// whose __NEXT_DATA__ JSON carries the match, market, kickoff (ISO, UTC) and best odds (fractional).

import type { ExtScrapedTip } from './tiporacle';

const URL = 'https://footyaccumulators.com/football-tips/bet-of-the-day';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

interface GridItem {
  match: { team_a_name: string; team_b_name: string; date_iso: string; competition_name?: string };
  selection: { headline: string };
}
interface TipperTip {
  meta: { title?: string; grid?: GridItem[]; bestOdds?: string };
}

function fractionToDecimal(f: string | undefined): number {
  const m = f?.match(/^(\d+)\/(\d+)$/);
  if (m) return Math.round((1 + +m[1] / +m[2]) * 100) / 100;
  const n = parseFloat(f ?? '');
  return isNaN(n) ? 0 : n;
}

/** Collects every "Bet of the Day" tip from any Tipster widget in the page JSON. */
function findBetsOfTheDay(node: unknown, out: TipperTip[] = []): TipperTip[] {
  if (Array.isArray(node)) {
    for (const v of node) findBetsOfTheDay(v, out);
  } else if (node && typeof node === 'object') {
    const o = node as Record<string, any>;
    if (o.component === 'Tipster' && Array.isArray(o.data?.tips)) {
      out.push(...o.data.tips.filter((t: TipperTip) => /bet of the day/i.test(t.meta?.title ?? '')));
    }
    for (const v of Object.values(o)) findBetsOfTheDay(v, out);
  }
  return out;
}

export function parseFootyAccumulators(html: string): ExtScrapedTip[] {
  const json = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (!json) throw new Error('footyaccumulators: __NEXT_DATA__ not found (page layout changed?)');
  // Only tips for matches that have not kicked off yet — a tip first seen after kickoff proves nothing.
  const now = Date.now();
  const upcoming = findBetsOfTheDay(JSON.parse(json))
    .filter((t) => t.meta.grid?.[0] && new Date(t.meta.grid[0].match.date_iso).getTime() > now)
    .sort((a, b) => a.meta.grid![0].match.date_iso.localeCompare(b.meta.grid![0].match.date_iso));
  const tip = upcoming[0];
  const leg = tip?.meta.grid?.[0];
  if (!tip || !leg) return [];

  const kick = new Date(leg.match.date_iso);
  const kickoff = kick.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zagreb',
  });

  return [{
    source: 'FOOTYACCA',
    date: leg.match.date_iso.slice(0, 10),
    rank: 1,
    homeTeam: leg.match.team_a_name,
    awayTeam: leg.match.team_b_name,
    league: leg.match.competition_name ?? '',
    market: leg.selection.headline,
    pick: leg.selection.headline,
    kickoff,
    odd: fractionToDecimal(tip.meta.bestOdds),
    confidence: null,
    sourceUrl: URL,
  }];
}

export async function scrapeFootyAccumulatorsToday(): Promise<ExtScrapedTip[]> {
  const res = await fetch(URL, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
  if (!res.ok) throw new Error(`footyaccumulators HTTP ${res.status}`);
  return parseFootyAccumulators(await res.text());
}
