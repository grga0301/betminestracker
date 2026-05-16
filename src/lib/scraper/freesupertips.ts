// src/lib/scraper/freesupertips.ts
import { chromium } from 'playwright';

export interface ScrapedFstTip {
  date: string;
  homeTeam: string;
  awayTeam: string;
  pick: string;
  market: string;
  kickoff: string;
  odd: number;
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
      const tipH2 = Array.from(document.querySelectorAll('h2')).find((h) =>
        h.textContent?.trim().toLowerCase().includes('bet of the day tip')
      );
      if (!tipH2) return null;

      const card = tipH2.closest('.Card');
      if (!card) return null;

      const leg = card.querySelector('.Leg');
      if (!leg) return null;

      // Kickoff time
      const kickoff = leg.querySelector('time')?.textContent?.trim() ?? '';

      // Pick text and home team
      const pick = leg.querySelector('.Leg__win')?.textContent?.trim() ?? '';
      const atText = leg.querySelector('.Leg__lose')?.textContent?.trim() ?? '';
      const homeTeam = atText.replace(/^at\s+/i, '').trim();

      // Team names from background-image URLs
      const teamDivs = Array.from(leg.querySelectorAll('.Team--xs'));
      const teamNames = teamDivs.map((el) => {
        const style = (el as HTMLElement).style?.backgroundImage ?? el.getAttribute('style') ?? '';
        const m = style.match(/\/team\/(.+?)\.png/i);
        return m ? decodeURIComponent(m[1]).trim() : '';
      }).filter(Boolean);

      const homeFromImg = teamNames[0] ?? homeTeam;
      const awayFromImg = teamNames[1] ?? '';

      // ── Extract best odds from the BetGrid ──
      // The BetGrid has a stake selector; read whichever option is selected
      const betGrid = card.querySelector('.BetGrid');
      let bestOdds = 0;

      if (betGrid) {
        const stakeSelect = betGrid.querySelector('select') as HTMLSelectElement | null;
        // Find selected option's value; default to 20 if none selected
        const selectedOption = stakeSelect
          ? Array.from(stakeSelect.options).find((o) => o.selected || o.classList.contains('active'))
          : null;
        const stake = parseFloat(selectedOption?.value ?? '20');

        // Collect all BetGrid__returns amounts
        const returnEls = Array.from(betGrid.querySelectorAll('.BetGrid__returns'));
        const returns = returnEls.map((el) => {
          const text = (el.textContent ?? '').replace(/[£,]/g, '').trim();
          return parseFloat(text);
        }).filter((n) => !isNaN(n) && n > 0);

        const bestReturn = returns.length > 0 ? Math.max(...returns) : 0;
        if (stake > 0 && bestReturn > 0) {
          bestOdds = Math.round((bestReturn / stake) * 100) / 100;
        }
      }

      return { kickoff, pick, homeTeam: homeFromImg || homeTeam, awayTeam: awayFromImg, bestOdds };
    });

    if (!result || !result.pick) {
      console.log('[FST] Could not extract tip data from page');
      return null;
    }

    const today = new Date().toISOString().split('T')[0];
    const awayTeam = result.awayTeam || result.pick.replace(/\s+to\s+win.*/i, '').trim();
    const market = inferMarket(result.pick, result.homeTeam, awayTeam);

    console.log(`[FST] ${result.homeTeam} vs ${awayTeam} | ${result.pick} | ${market} | KO: ${result.kickoff} | Odd: ${result.bestOdds}`);

    return {
      date: today,
      homeTeam: result.homeTeam || 'Unknown',
      awayTeam: awayTeam || 'Unknown',
      pick: result.pick,
      market,
      kickoff: result.kickoff,
      odd: result.bestOdds,
    };
  } finally {
    await browser.close();
  }
}
