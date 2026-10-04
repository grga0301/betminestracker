// src/lib/scraper/footballpark.ts
// footballpark.com publishes one "Bet of the Day" (usually a 1X2 pick) with odds in a server-rendered card.

import { parse } from 'node-html-parser';
import type { ExtScrapedTip } from './tiporacle';

const URL = 'https://footballpark.com/betting/tips/bet-of-the-day';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export function parseFootballPark(html: string): ExtScrapedTip[] {
  const tips: ExtScrapedTip[] = [];

  parse(html).querySelectorAll('.botd-card').forEach((card, i) => {
    const names = card.querySelectorAll('.botd-card__team-name').map((e) => e.text.trim());
    const kickoffText = card.querySelector('.botd-card__kickoff')?.text.trim() ?? ''; // 04.10.2026 - 13:00
    const pick = card.querySelector('.botd-card__tip-pick')?.text.trim() ?? '';
    const odd = parseFloat(card.querySelector('.botd-card__tip-odds')?.text.replace(/[^\d.]/g, '') ?? '');
    const conf = parseFloat(card.querySelector('.botd-card__tip-confidence')?.text ?? '');
    const league = (card.querySelector('.botd-card__badge')?.text ?? '').split('—')[0].trim();

    const m = kickoffText.match(/(\d{2})\.(\d{2})\.(\d{4})\s*-\s*(\d{2}:\d{2})/);
    if (names.length !== 2 || !pick || !m || isNaN(odd)) return; // no odds → cannot track profit

    tips.push({
      source: 'FOOTBALLPARK',
      date: `${m[3]}-${m[2]}-${m[1]}`,
      rank: i + 1,
      homeTeam: names[0],
      awayTeam: names[1],
      league,
      market: pick,
      pick,
      kickoff: m[4],
      odd,
      confidence: isNaN(conf) ? null : Math.round(conf),
      sourceUrl: URL,
    });
  });

  return tips;
}

export async function scrapeFootballParkToday(): Promise<ExtScrapedTip[]> {
  const res = await fetch(URL, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
  if (!res.ok) throw new Error(`footballpark HTTP ${res.status}`);
  const html = await res.text();
  const tips = parseFootballPark(html);
  if (tips.length === 0 && !html.includes('botd-card')) {
    const title = html.match(/<title>([^<]*)/)?.[1] ?? '(no title)';
    throw new Error(`footballpark: no pick card in page (${html.length} bytes, title "${title}")`);
  }
  return tips;
}
