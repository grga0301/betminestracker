// src/lib/scraper/betmines.ts
// Scrapes today's football double from https://betmines.com/daily-bets-football

import { chromium, Browser } from 'playwright';
import type { ScrapedDouble, ScrapedSelection } from '../types';

const BETMINES_URL = 'https://betmines.com/daily-bets-football';

function getTodayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function extractCountry(league: string): string {
  const known: Record<string, string> = {
    premier: 'England',
    bundesliga: 'Germany',
    laliga: 'Spain',
    ligue: 'France',
    serie: 'Italy',
    champions: 'Europe',
    allsvenskan: 'Sweden',
    superettan: 'Sweden',
    ettan: 'Sweden',
    eliteserien: 'Norway',
    veikkausliiga: 'Finland',
  };
  const lower = league.toLowerCase();
  for (const [key, country] of Object.entries(known)) {
    if (lower.includes(key)) return country;
  }
  return 'Unknown';
}

function parseKickoffISO(timeStr: string): string {
  // timeStr is "15:30" — combine with today's date
  const today = getTodayString();
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return new Date().toISOString();
  return new Date(`${today}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).toISOString();
}

/**
 * Converts betmines market label + pick into our internal market string and line.
 * Examples:
 *   "BTTS" + "Yes"    → { market: "BTTS",   line: null }
 *   "BTTS" + "No"     → { market: "No BTTS", line: null }
 *   "Number of goals" + "+2.5" → { market: "Over 2.5", line: 2.5 }
 *   "Number of goals" + "-2.5" → { market: "Under 2.5", line: 2.5 }
 *   "1X2" + "1"       → { market: "Home",   line: null }
 *   "1X2" + "X"       → { market: "Draw",   line: null }
 *   "1X2" + "2"       → { market: "Away",   line: null }
 */
function resolveMarket(marketLabel: string, pick: string): { market: string; line: number | null } {
  const ml = marketLabel.toLowerCase();
  const pk = pick.trim();

  if (ml.includes('btts') || ml.includes('both teams')) {
    return { market: pk.toLowerCase() === 'no' ? 'No BTTS' : 'BTTS', line: null };
  }

  if (ml.includes('number of goals') || ml.includes('goals') || ml.includes('over') || ml.includes('under')) {
    const isUnder = pk.startsWith('-') || ml.includes('under');
    const lineVal = parseFloat(pk.replace(/[+-]/g, ''));
    const line = isNaN(lineVal) ? null : lineVal;
    const direction = isUnder ? 'Under' : 'Over';
    return { market: line !== null ? `${direction} ${line}` : marketLabel, line };
  }

  if (ml.includes('1x2') || ml.includes('result')) {
    const map: Record<string, string> = { '1': 'Home', 'x': 'Draw', '2': 'Away' };
    return { market: map[pk.toLowerCase()] || pk, line: null };
  }

  if (ml.includes('double chance')) {
    return { market: pk || 'Double Chance', line: null };
  }

  if (ml.includes('asian handicap') || ml.includes('handicap')) {
    const lineVal = parseFloat(pk.replace(/[^0-9.-]/g, ''));
    return { market: `Asian Handicap ${pk}`, line: isNaN(lineVal) ? null : lineVal };
  }

  return { market: marketLabel || pick, line: null };
}

/**
 * Main scraper — extracts the "Double" section from betmines.com/daily-bets-football.
 */
export async function scrapeTodaysDouble(): Promise<ScrapedDouble | null> {
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    });

    console.log(`[Scraper] Navigating to ${BETMINES_URL}`);
    await page.goto(BETMINES_URL, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForTimeout(4000);

    const raw = await page.evaluate(() => {
      // ── 1. Find the "Double" section via its H2 label ──────────────────────
      const doubleH2 = Array.from(document.querySelectorAll('h2'))
        .find((h) => h.textContent?.trim() === 'Double');
      if (!doubleH2) return null;

      const container = doubleH2.parentElement;
      if (!container) return null;

      // ── 2. Collect total odds ───────────────────────────────────────────────
      const totalOddsUL = Array.from(container.querySelectorAll(':scope > ul'))
        .find((ul) => ul.textContent?.includes('Total odd'));
      const totalOddsText = totalOddsUL?.textContent || '';
      const totalOddsMatch = totalOddsText.match(/([\d]+\.[\d]+)\s*$/);
      const totalOdds = totalOddsMatch ? parseFloat(totalOddsMatch[1]) : 0;

      // ── 3. Collect each match UL (those containing a fixture) ──────────────
      const matchULs = Array.from(container.querySelectorAll(':scope > ul'))
        .filter((ul) => ul.querySelector('.daily-bet-fixture-content'));

      const selections = matchULs.map((ul) => {
        // League name
        const leagueEl = ul.querySelector('.daily-bet-league-header');
        const league = (leagueEl?.textContent || '').trim().replace(/\s+/g, ' ');

        // Fixture element
        const fixture = ul.querySelector('.daily-bet-fixture-content') as HTMLElement | null;
        if (!fixture) return null;

        // ── Team names: use img alt attributes (most reliable) ──
        const teamImgs = Array.from(fixture.querySelectorAll('img[alt^="Logo of"]'));
        const homeTeam = (teamImgs[0]?.getAttribute('alt') || '').replace('Logo of ', '').trim();
        const awayTeam = (teamImgs[1]?.getAttribute('alt') || '').replace('Logo of ', '').trim();

        if (!homeTeam || !awayTeam) return null;

        // ── Kickoff time from the parent fixture-row ──
        const fixtureRow = fixture.closest('.daily-bet-fixture-row');
        const rowText = (fixtureRow?.textContent || '').trim();
        const timeMatch = rowText.match(/^(\d{1,2}:\d{2})/);
        const kickoffRaw = timeMatch ? timeMatch[1] : '';

        // ── Parse market + pick + odd from fixture text ──
        const fixtureText = (fixture.textContent || '').trim();
        // Get clean lines, removing team names and whitespace
        const lines = fixtureText
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l && l !== homeTeam && l !== awayTeam);

        // Odd: last line that looks like a float (e.g., "1.44")
        let odd = 1.5;
        for (let i = lines.length - 1; i >= 0; i--) {
          const n = parseFloat(lines[i]);
          if (!isNaN(n) && lines[i].includes('.') && n >= 1.0 && n <= 50) {
            odd = n;
            lines.splice(i, 1);
            break;
          }
        }

        // Skip score lines (two numbers like "4 0" or "4 1")
        const filtered = lines.filter((l) => !/^\d+\s+\d+$/.test(l));

        // Market keyword and pick
        const marketKeywords = /btts|both teams|number of goals|1x2|double chance|handicap|over|under/i;
        const marketIdx = filtered.findIndex((l) => marketKeywords.test(l));
        const marketLabel = marketIdx >= 0 ? filtered[marketIdx] : '';
        const pick = marketIdx >= 0 && filtered[marketIdx + 1] ? filtered[marketIdx + 1] : '';

        return { homeTeam, awayTeam, league, kickoffRaw, marketLabel, pick, odd };
      }).filter(Boolean) as Array<{
        homeTeam: string; awayTeam: string; league: string;
        kickoffRaw: string; marketLabel: string; pick: string; odd: number;
      }>;

      return { selections, totalOdds };
    });

    if (!raw || raw.selections.length === 0) {
      console.warn('[Scraper] Double section not found on page. Using demo data.');
      return getDemoDouble();
    }

    if (raw.selections.length < 2) {
      console.warn(`[Scraper] Only ${raw.selections.length} selection(s) found. Expected 2. Using demo data.`);
      return getDemoDouble();
    }

    const today = getTodayString();
    let totalOdds = raw.totalOdds;

    const selections: ScrapedSelection[] = raw.selections.map((s) => {
      const { market, line } = resolveMarket(s.marketLabel, s.pick);
      return {
        homeTeam: s.homeTeam,
        awayTeam: s.awayTeam,
        market,
        line,
        odd: s.odd,
        league: s.league,
        country: extractCountry(s.league),
        kickoff: s.kickoffRaw ? parseKickoffISO(s.kickoffRaw) : new Date().toISOString(),
      };
    });

    if (!totalOdds || totalOdds < 1) {
      totalOdds = selections.reduce((acc, s) => acc * s.odd, 1);
    }

    console.log(`[Scraper] Found Double: ${selections.map(s => `${s.homeTeam} vs ${s.awayTeam} (${s.market} @ ${s.odd})`).join(', ')}`);
    console.log(`[Scraper] Total odds: ${totalOdds}`);

    return { date: today, totalOdds, selections };
  } catch (err) {
    console.error('[Scraper] Error:', err);
    throw err;
  } finally {
    if (browser) await browser.close();
  }
}

function getDemoDouble(): ScrapedDouble {
  const today = getTodayString();
  console.log('[Scraper] Using demo double for date:', today);
  return {
    date: today,
    totalOdds: 2.0,
    selections: [
      {
        homeTeam: 'SC Freiburg',
        awayTeam: 'Sporting Braga',
        market: 'Over 1.5',
        line: 1.5,
        odd: 1.33,
        league: 'UEFA Europa League',
        country: 'Europe',
        kickoff: new Date().toISOString(),
      },
      {
        homeTeam: 'Sleipner',
        awayTeam: 'Syrianska',
        market: 'Over 2.5',
        line: 2.5,
        odd: 1.50,
        league: 'Superettan',
        country: 'Sweden',
        kickoff: new Date().toISOString(),
      },
    ],
  };
}

/**
 * Scrape all match results from the daily bets page in a single browser session.
 */
export async function scrapeResultsFromDailyPage(): Promise<
  Array<{ homeTeam: string; awayTeam: string; homeScore: number; awayScore: number }>
> {
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    });

    console.log('[Scraper] Loading daily bets page for results...');
    await page.goto(BETMINES_URL, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForTimeout(3000);

    const results = await page.evaluate(() => {
      const found: Array<{ homeTeam: string; awayTeam: string; homeScore: number; awayScore: number }> = [];

      // Only look inside --with-score fixtures (matches that are finished)
      const scored = Array.from(document.querySelectorAll('.daily-bet-fixture-content--with-score'));
      for (const fixture of scored) {
        const teamImgs = Array.from(fixture.querySelectorAll('img[alt^="Logo of"]'));
        const homeTeam = (teamImgs[0]?.getAttribute('alt') || '').replace('Logo of ', '').trim();
        const awayTeam = (teamImgs[1]?.getAttribute('alt') || '').replace('Logo of ', '').trim();
        if (!homeTeam || !awayTeam) continue;

        const text = (fixture.textContent || '').trim();
        // Score appears as "4 0" or "2 1" in the text
        const scoreMatch = text.match(/\b(\d{1,2})\s+(\d{1,2})\b/);
        if (!scoreMatch) continue;

        const homeScore = parseInt(scoreMatch[1]);
        const awayScore = parseInt(scoreMatch[2]);
        if (homeScore > 20 || awayScore > 20) continue;

        found.push({ homeTeam, awayTeam, homeScore, awayScore });
      }

      return found;
    });

    console.log(`[Scraper] Found ${results.length} result(s) on daily page`);
    return results;
  } catch (err) {
    console.error('[Scraper] Daily page results error:', err);
    return [];
  } finally {
    if (browser) await browser.close();
  }
}

/**
 * Scrape final score for a specific match from the BetMines results page (fallback).
 */
export async function scrapeMatchResult(
  homeTeam: string,
  awayTeam: string
): Promise<{ homeScore: number; awayScore: number } | null> {
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();

    await page.goto('https://betmines.com/football-results', {
      waitUntil: 'networkidle',
      timeout: 45_000,
    });

    await page.waitForTimeout(2000);

    const result = await page.evaluate(
      ({ home, away }: { home: string; away: string }) => {
        const bodyText = document.body.innerText;
        const teamPattern = new RegExp(
          `${home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]{0,100}(\\d+)\\s*[-:]\\s*(\\d+)[\\s\\S]{0,100}${away.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
          'i'
        );
        const match = bodyText.match(teamPattern);
        if (match) {
          return { homeScore: parseInt(match[1]), awayScore: parseInt(match[2]) };
        }
        return null;
      },
      { home: homeTeam, away: awayTeam }
    );

    return result;
  } catch (err) {
    console.error('[Scraper] Result scrape error:', err);
    return null;
  } finally {
    if (browser) await browser.close();
  }
}
