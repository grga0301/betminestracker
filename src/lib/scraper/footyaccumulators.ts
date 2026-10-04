// src/lib/scraper/footyaccumulators.ts
// footyaccumulators.com publishes tips as Next.js pages whose __NEXT_DATA__ JSON carries the matches,
// markets, kickoffs (ISO, UTC) and best odds (fractional). We read several categories:
//   - Bet of the Day  → one match (single tip)
//   - BTTS Tip        → treble, every leg "BTTS - Yes"
//   - Over 2.5 Tip    → treble, every leg "Over 2.5 Goals"

import type { ExtLeg, ExtScrapedTip, ExtSourceKey } from './tiporacle';

const BASE = 'https://footyaccumulators.com/football-tips';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

interface GridItem {
  match: { team_a_name: string; team_b_name: string; date_iso: string; competition_name?: string };
  selection: { headline: string };
}
interface TipperTip {
  meta: { title?: string; grid?: GridItem[]; bestOdds?: string };
}

export interface FaCategory {
  path: string;
  source: ExtSourceKey;
  title: RegExp;
}

export const FA_CATEGORIES: FaCategory[] = [
  { path: 'bet-of-the-day', source: 'FOOTYACCA', title: /bet of the day/i },
  { path: 'btts', source: 'FOOTYACCA_BTTS', title: /btts/i },
  { path: 'over-2-5-trebles', source: 'FOOTYACCA_OVER25', title: /over 2\.5/i },
];

/** "79/50" → 2.58, "4.37/1" → 5.37 */
export function fractionToDecimal(f: string | undefined): number {
  const m = f?.trim().match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (m) return Math.round((1 + +m[1] / +m[2]) * 100) / 100;
  const n = parseFloat(f ?? '');
  return isNaN(n) ? 0 : n;
}

/** Collects every Tipster tip whose title matches, from anywhere in the page JSON. */
function findTips(node: unknown, title: RegExp, out: TipperTip[] = []): TipperTip[] {
  if (Array.isArray(node)) {
    for (const v of node) findTips(v, title, out);
  } else if (node && typeof node === 'object') {
    const o = node as Record<string, any>;
    if (o.component === 'Tipster' && Array.isArray(o.data?.tips)) {
      out.push(...o.data.tips.filter((t: TipperTip) => title.test(t.meta?.title ?? '')));
    }
    for (const v of Object.values(o)) findTips(v, title, out);
  }
  return out;
}

function zagrebTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zagreb' });
}

export function parseFootyAccumulators(html: string, cat: FaCategory = FA_CATEGORIES[0]): ExtScrapedTip[] {
  const json = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (!json) throw new Error('footyaccumulators: __NEXT_DATA__ not found (page layout changed?)');

  // Only tickets whose first match has not kicked off yet — a tip first seen later proves nothing.
  const now = Date.now();
  const kickoffs = (t: TipperTip) => (t.meta.grid ?? []).map((g) => g.match.date_iso).sort();
  const all = findTips(JSON.parse(json), cat.title);
  const upcoming = all
    .filter((t) => kickoffs(t).length > 0 && new Date(kickoffs(t)[0]).getTime() > now)
    .sort((a, b) => kickoffs(a)[0].localeCompare(kickoffs(b)[0]));
  const tip = upcoming[0];
  if (!tip) {
    const seen = all.map((t) => `"${t.meta.title}" first kickoff ${kickoffs(t)[0] ?? 'n/a'}`).join('; ') || 'no matching tip in page';
    console.log(`  [FA ${cat.path}] nothing upcoming — ${seen}`);
    return [];
  }

  const grid = [...(tip.meta.grid ?? [])].sort((a, b) => a.match.date_iso.localeCompare(b.match.date_iso));
  const first = grid[0];
  const odd = fractionToDecimal(tip.meta.bestOdds);

  const base = {
    source: cat.source,
    date: first.match.date_iso.slice(0, 10),
    rank: 1,
    homeTeam: first.match.team_a_name,
    awayTeam: first.match.team_b_name,
    league: first.match.competition_name ?? '',
    kickoff: zagrebTime(first.match.date_iso),
    odd,
    confidence: null,
    sourceUrl: `${BASE}/${cat.path}`,
  };

  if (grid.length === 1) {
    return [{ ...base, market: first.selection.headline, pick: first.selection.headline }];
  }

  const legs: ExtLeg[] = grid.map((g) => ({
    homeTeam: g.match.team_a_name,
    awayTeam: g.match.team_b_name,
    market: g.selection.headline,
    kickoffIso: g.match.date_iso,
    status: 'PENDING',
    homeScore: null,
    awayScore: null,
  }));
  const label = `${grid.length}-fold: ${grid.map((g) => g.selection.headline).filter((v, i, a) => a.indexOf(v) === i).join(' / ')}`;
  return [{ ...base, market: label, pick: label, legs }];
}

export async function scrapeFootyAccumulatorsCategory(cat: FaCategory): Promise<ExtScrapedTip[]> {
  const res = await fetch(`${BASE}/${cat.path}`, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
  if (!res.ok) throw new Error(`footyaccumulators ${cat.path} HTTP ${res.status}`);
  return parseFootyAccumulators(await res.text(), cat);
}

/** Kept for the single "Bet of the Day" callers. */
export const scrapeFootyAccumulatorsToday = () => scrapeFootyAccumulatorsCategory(FA_CATEGORIES[0]);
