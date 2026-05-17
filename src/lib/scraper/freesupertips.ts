// src/lib/scraper/freesupertips.ts
// Uses fetch + HTML parser — no Playwright needed (WordPress SSR page)
import { parse } from 'node-html-parser';

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
  const res = await fetch('https://www.freesupertips.com/bet-of-the-day-tips/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    console.log(`[FST] HTTP error: ${res.status}`);
    return null;
  }

  const html = await res.text();
  const root = parse(html);

  // Find "Bet of the Day Tip" h2
  const allH2 = root.querySelectorAll('h2');
  const tipH2 = allH2.find((h) =>
    h.text.trim().toLowerCase().includes('bet of the day tip')
  );
  if (!tipH2) {
    console.log('[FST] Could not find "Bet of the Day Tip" h2');
    return null;
  }

  // Walk up to .Card
  let card = tipH2.parentNode;
  for (let i = 0; i < 5; i++) {
    if (!card) break;
    if (card.classNames?.includes('Card')) break;
    card = card.parentNode;
  }
  if (!card) {
    console.log('[FST] Could not find parent .Card');
    return null;
  }

  const leg = card.querySelector('.Leg');
  if (!leg) {
    console.log('[FST] Could not find .Leg inside card');
    return null;
  }

  // Kickoff — FreeSuperTips uses UK time (GMT/BST), we display in CET (+2h)
  const rawKickoff = leg.querySelector('time')?.text.trim() ?? '';
  const kickoff = (() => {
    const m = rawKickoff.match(/(\d{1,2}):(\d{2})/);
    if (!m) return rawKickoff;
    const h = (parseInt(m[1]) + 2) % 24;
    return `${String(h).padStart(2, '0')}:${m[2]}`;
  })();

  // Pick and home team
  const pick = leg.querySelector('.Leg__win')?.text.trim() ?? '';
  const atText = leg.querySelector('.Leg__lose')?.text.trim() ?? '';
  const homeTeam = atText.replace(/^at\s+/i, '').trim();

  // Team names from background-image style attributes
  const teamDivs = leg.querySelectorAll('.Team--xs');
  const teamNames = teamDivs.map((el) => {
    const style = el.getAttribute('style') ?? '';
    const m = style.match(/\/team\/(.+?)\.png/i);
    return m ? decodeURIComponent(m[1]).trim() : '';
  }).filter(Boolean);

  const homeFromImg = teamNames[0] || homeTeam;
  const awayFromImg = teamNames[1] || pick.replace(/\s+to\s+win.*/i, '').trim();

  // Best odds from BetGrid
  let bestOdds = 0;
  const betGrid = card.querySelector('.BetGrid');
  if (betGrid) {
    // Find selected stake option
    const selectedOption = betGrid.querySelectorAll('select option').find(
      (o) => o.getAttribute('selected') !== null || o.classNames?.includes('active')
    );
    const stake = parseFloat(selectedOption?.getAttribute('value') ?? '20');

    const returnEls = betGrid.querySelectorAll('.BetGrid__returns');
    const returns = returnEls.map((el) => {
      const text = el.text.replace(/[£,]/g, '').trim();
      return parseFloat(text);
    }).filter((n) => !isNaN(n) && n > 0);

    const bestReturn = returns.length > 0 ? Math.max(...returns) : 0;
    if (stake > 0 && bestReturn > 0) {
      bestOdds = Math.round((bestReturn / stake) * 100) / 100;
    }
  }

  if (!pick) {
    console.log('[FST] Empty pick — could not extract tip');
    return null;
  }

  const today = new Date().toISOString().split('T')[0];
  const market = inferMarket(pick, homeFromImg, awayFromImg);

  console.log(`[FST] ${homeFromImg} vs ${awayFromImg} | ${pick} | ${market} | KO: ${kickoff} | Odd: ${bestOdds}`);

  return {
    date: today,
    homeTeam: homeFromImg || 'Unknown',
    awayTeam: awayFromImg || 'Unknown',
    pick,
    market,
    kickoff,
    odd: bestOdds,
  };
}
