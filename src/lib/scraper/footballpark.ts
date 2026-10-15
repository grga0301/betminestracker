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

// footballpark.com refuses GitHub's datacenter IPs (tiny non-HTML reply). r.jina.ai fetches it from its
// own network, but it intermittently answers with a ~205 byte error instead of the page. Since the workflow
// only gets a few runs per day, one bad run can lose the whole day's tip — so try several routes, with retries.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Route = { name: string; url: string; headers: Record<string, string> };

function routes(): Route[] {
  const jinaKey = process.env.JINA_API_KEY;
  return [
    { name: 'direct', url: URL, headers: { 'User-Agent': UA, 'Accept-Language': 'en' } },
    {
      name: 'r.jina.ai',
      url: `https://r.jina.ai/${URL}`,
      headers: { 'X-Return-Format': 'html', ...(jinaKey ? { Authorization: `Bearer ${jinaKey}` } : {}) },
    },
    {
      name: 'r.jina.ai(no-cache)',
      url: `https://r.jina.ai/${URL}`,
      headers: { 'X-Return-Format': 'html', 'X-No-Cache': 'true', ...(jinaKey ? { Authorization: `Bearer ${jinaKey}` } : {}) },
    },
    { name: 'allorigins', url: `https://api.allorigins.win/raw?url=${encodeURIComponent(URL)}`, headers: { 'User-Agent': UA } },
    { name: 'corsproxy', url: `https://corsproxy.io/?${encodeURIComponent(URL)}`, headers: { 'User-Agent': UA } },
  ];
}

async function fetchHtml(): Promise<{ html: string; via: string }> {
  const failures: string[] = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    for (const r of routes()) {
      try {
        const res = await fetch(r.url, { headers: r.headers, signal: AbortSignal.timeout(30_000) });
        const body = await res.text();
        if (res.ok && body.includes('botd-card')) return { html: body, via: `${r.name}#${attempt}` };
        failures.push(`${r.name}#${attempt}: HTTP ${res.status}, ${body.length}B "${body.replace(/\s+/g, ' ').slice(0, 120)}"`);
      } catch (e) {
        failures.push(`${r.name}#${attempt}: ${e instanceof Error ? e.message : e}`);
      }
    }
    if (attempt < 3) await sleep(attempt * 5_000);
  }
  throw new Error(`footballpark: no pick card from any route —\n    ${failures.join('\n    ')}`);
}

export async function scrapeFootballParkToday(): Promise<ExtScrapedTip[]> {
  const { html, via } = await fetchHtml();
  console.log(`  (footballpark fetched via ${via})`);
  return parseFootballPark(html);
}
