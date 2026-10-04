// src/lib/scraper/tiporacle.ts
// TipOracle front page lists its "Best Betting Tips Today" (3 selections) with odds and confidence.

import { parse } from 'node-html-parser';

export interface ExtScrapedTip {
  source: 'TIPORACLE' | 'FOREBET' | 'FOOTYACCA';
  date: string; // YYYY-MM-DD
  rank: number;
  homeTeam: string;
  awayTeam: string;
  league: string;
  market: string;
  pick: string;
  kickoff: string;
  odd: number;
  confidence: number | null;
  sourceUrl: string | null;
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export function parseTipOracle(html: string, date: string): ExtScrapedTip[] {
  const tips: ExtScrapedTip[] = [];
  const cards = parse(html).querySelectorAll('a.hr-pick-card');

  cards.forEach((card, i) => {
    const match = card.querySelector('.hr-pick-match')?.text.trim() ?? '';
    const info = card.querySelector('.hr-pick-info')?.text.trim() ?? ''; // Market · League · 16:00
    const odd = parseFloat(card.querySelector('.hr-pick-odds')?.text ?? '');
    const conf = parseInt(card.querySelector('.hr-pick-conf')?.text ?? '', 10);

    const teams = match.split(/\s+vs\s+/i);
    const parts = info.split('·').map((s) => s.trim());
    if (teams.length !== 2 || parts.length < 3 || isNaN(odd)) return;

    tips.push({
      source: 'TIPORACLE',
      date,
      rank: i + 1,
      homeTeam: teams[0],
      awayTeam: teams[1],
      market: parts[0],
      pick: parts[0],
      league: parts.slice(1, -1).join(' · '),
      kickoff: parts[parts.length - 1],
      odd,
      confidence: isNaN(conf) ? null : conf,
      sourceUrl: null,
    });
  });
  return tips;
}

export async function scrapeTipOracleToday(): Promise<ExtScrapedTip[]> {
  const res = await fetch('https://www.tiporacle.com/', { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`TipOracle HTTP ${res.status}`);
  const html = await res.text();
  // The hero shows "Football Prediction Tips · 4 October 2026" — trust that over the server clock.
  const m = html.match(/Football Prediction Tips\s*·\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  const date = m
    ? new Date(`${m[1]} ${m[2]} ${m[3]} 12:00 UTC`).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  return parseTipOracle(html, date);
}
