// src/lib/scraper/freesupertips.ts
import { chromium } from 'playwright';

export interface ScrapedFstTip {
  date: string;
  homeTeam: string;
  awayTeam: string;
  pick: string;
  market: string;
  kickoff: string;
}

function normalizeTeamName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function inferMarket(pick: string, homeTeam: string, awayTeam: string): string {
  const lower = pick.toLowerCase();

  if (lower.includes('both teams to score') || lower === 'btts - yes' || lower === 'btts') {
    return 'BTTS';
  }
  if (lower.includes('btts') && lower.includes('no')) return 'BTTS No';

  const overMatch = lower.match(/over\s+(\d+\.?\d*)\s+goals?/);
  if (overMatch) return `Over ${overMatch[1]}`;

  const underMatch = lower.match(/under\s+(\d+\.?\d*)\s+goals?/);
  if (underMatch) return `Under ${underMatch[1]}`;

  if (lower.includes('draw')) return 'Draw';

  if (lower.includes('to win') || lower.includes(' win')) {
    const teamPart = pick.replace(/\s+to\s+win/i, '').replace(/\s+win$/i, '').trim();
    const nh = normalizeTeamName(homeTeam);
    const na = normalizeTeamName(awayTeam);
    const np = normalizeTeamName(teamPart);
    if (nh && np && (nh === np || nh.includes(np) || np.includes(nh))) return 'Home';
    if (na && np && (na === np || na.includes(np) || np.includes(na))) return 'Away';
    return 'Home'; // default if can't determine
  }

  return pick;
}

export async function scrapeFstBetOfTheDay(): Promise<ScrapedFstTip | null> {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    });

    await page.goto('https://www.freesupertips.com/bet-of-the-day-tips/', {
      waitUntil: 'networkidle',
      timeout: 60_000,
    });
    await page.waitForTimeout(3000);

    const result = await page.evaluate(() => {
      // Find "Bet of the Day Tip" h2
      const allH2 = Array.from(document.querySelectorAll('h2'));
      const tipH2 = allH2.find((h) =>
        h.textContent?.trim().toLowerCase().includes('bet of the day tip')
      );
      if (!tipH2) return null;

      // Walk up to find the containing card/section
      let container: Element | null = tipH2;
      for (let i = 0; i < 6; i++) {
        container = container?.parentElement ?? null;
        if (!container) break;
        // Look for a Leg element inside this container
        const leg = container.querySelector('.Leg');
        if (leg) {
          container = leg;
          break;
        }
      }
      if (!container) return null;

      // Extract kickoff time
      const timeEl = container.querySelector('time') ?? tipH2.parentElement?.querySelector('time');
      const kickoff = timeEl?.textContent?.trim() ?? '';

      // Extract pick text — TipCell__bet--strong or TipCell__bet
      const betStrong = container.querySelector('.TipCell__bet--strong, .TipCell__bet');
      const pick = betStrong?.textContent?.trim() ?? '';

      // Extract home team from "at <TeamName>" text in the Leg__teams or any nearby element
      let homeTeam = '';
      let atText = '';

      // Look for element containing "at " pattern
      const allSpans = Array.from(container.querySelectorAll('span, p, div, a'));
      for (const el of allSpans) {
        const text = el.textContent?.trim() ?? '';
        if (/^at\s+\w/i.test(text) && el.children.length === 0) {
          atText = text.replace(/^at\s+/i, '').trim();
          break;
        }
      }
      homeTeam = atText;

      // Extract away team from pick text (strip "to Win" suffix)
      const awayTeam = pick.replace(/\s+to\s+win\b.*/i, '').replace(/\s+win\b.*/i, '').trim();

      return { kickoff, pick, homeTeam, awayTeam };
    });

    if (!result || !result.pick) {
      console.log('[FST] Could not extract tip data from page');
      return null;
    }

    const today = new Date().toISOString().split('T')[0];
    const market = inferMarket(result.pick, result.homeTeam, result.awayTeam);

    return {
      date: today,
      homeTeam: result.homeTeam || 'Unknown',
      awayTeam: result.awayTeam || result.pick,
      pick: result.pick,
      market,
      kickoff: result.kickoff,
    };
  } finally {
    await browser.close();
  }
}
