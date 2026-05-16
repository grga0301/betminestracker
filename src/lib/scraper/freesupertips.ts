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

  if (lower.includes('both teams to score') || lower === 'btts - yes') return 'BTTS';
  if (lower.includes('btts') && lower.includes('no')) return 'BTTS No';

  const overMatch = lower.match(/over\s+(\d+\.?\d*)\s+goals?/);
  if (overMatch) return `Over ${overMatch[1]}`;

  const underMatch = lower.match(/under\s+(\d+\.?\d*)\s+goals?/);
  if (underMatch) return `Under ${underMatch[1]}`;

  if (lower.includes('draw')) return 'Draw';

  if (lower.includes('to win')) {
    const teamPart = pick.replace(/\s+to\s+win.*/i, '').trim();
    const nh = normalizeTeamName(homeTeam);
    const na = normalizeTeamName(awayTeam);
    const np = normalizeTeamName(teamPart);
    if (nh && np && (nh === np || nh.includes(np) || np.includes(nh))) return 'Home';
    if (na && np && (na === np || na.includes(np) || np.includes(na))) return 'Away';
    return 'Away';
  }

  return pick;
}

// Extract team name from background-image URL like:
// url("/wp-content/themes/freesupertips/image/team/Manchester City.png")
function teamNameFromStyle(style: string): string {
  const m = style.match(/\/team\/(.+?)\.png/i);
  if (!m) return '';
  return decodeURIComponent(m[1]).trim();
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
      // Find the Card containing "Bet of the Day Tip" h2
      const allH2 = Array.from(document.querySelectorAll('h2'));
      const tipH2 = allH2.find((h) =>
        h.textContent?.trim().toLowerCase().includes('bet of the day tip')
      );
      if (!tipH2) return null;

      // The h2 is inside <header> inside <div class="Card">
      const card = tipH2.closest('.Card');
      if (!card) return null;

      const leg = card.querySelector('.Leg');
      if (!leg) return null;

      // Kickoff time
      const kickoff = leg.querySelector('time')?.textContent?.trim() ?? '';

      // Pick text (the team picked to win)
      const pickEl = leg.querySelector('.Leg__win');
      const pick = pickEl?.textContent?.trim() ?? '';

      // Home team from ".Leg__lose" which contains "at Chelsea"
      const loseEl = leg.querySelector('.Leg__lose');
      const atText = loseEl?.textContent?.trim() ?? '';
      const homeTeam = atText.replace(/^at\s+/i, '').trim();

      // Both teams from background-image URLs on .Team--xs divs
      const teamDivs = Array.from(leg.querySelectorAll('.Team--xs'));
      const teamNames = teamDivs.map((el) => {
        const style = (el as HTMLElement).style?.backgroundImage ?? el.getAttribute('style') ?? '';
        const m = style.match(/\/team\/(.+?)\.png/i);
        return m ? decodeURIComponent(m[1]).trim() : '';
      }).filter(Boolean);

      // teamNames[0] = home, teamNames[1] = away (order in DOM matches home/away)
      const homeFromImg = teamNames[0] ?? homeTeam;
      const awayFromImg = teamNames[1] ?? '';

      return { kickoff, pick, homeTeam: homeFromImg || homeTeam, awayTeam: awayFromImg };
    });

    if (!result || !result.pick) {
      console.log('[FST] Could not extract tip data from page');
      return null;
    }

    const today = new Date().toISOString().split('T')[0];

    // Away team fallback: strip "to Win" from pick if image extraction failed
    const awayTeam = result.awayTeam ||
      result.pick.replace(/\s+to\s+win.*/i, '').trim();

    const market = inferMarket(result.pick, result.homeTeam, awayTeam);

    console.log(`[FST] Extracted: ${result.homeTeam} vs ${awayTeam} | Pick: ${result.pick} | Market: ${market} | Kickoff: ${result.kickoff}`);

    return {
      date: today,
      homeTeam: result.homeTeam || 'Unknown',
      awayTeam: awayTeam || 'Unknown',
      pick: result.pick,
      market,
      kickoff: result.kickoff,
    };
  } finally {
    await browser.close();
  }
}
