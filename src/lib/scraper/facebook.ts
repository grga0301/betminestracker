// src/lib/scraper/facebook.ts
// Scrapes IceHockeyBet Facebook page using Playwright + login
import { chromium } from 'playwright';

const FB_PAGE_URL = 'https://m.facebook.com/IceHockeyBet';

export interface FbScrapedSelection {
  kickoff: string;
  homeTeam: string;
  awayTeam: string;
  market: string;
  odd: number;
}

export interface FbScrapedTicket {
  date: string;
  postId: string;
  totalOdds: number;
  selections: FbScrapedSelection[];
}

// Parse a single match line: "20:00 Al Ahli - Al Fateh 1&2-6 (1.50)✅"
function parseMatchLine(line: string): FbScrapedSelection | null {
  // Match: TIME  HOME - AWAY  MARKET  (ODD)
  const m = line.match(
    /^(\d{1,2}:\d{2})\s+(.+?)\s+-\s+(.+?)\s+([\w&+\-\/X12x]+)\s+\((\d+\.\d+)\)/
  );
  if (!m) return null;

  const [, kickoff, homeTeam, awayTeam, market, oddStr] = m;
  const odd = parseFloat(oddStr);
  if (isNaN(odd)) return null;

  return {
    kickoff: kickoff.trim(),
    homeTeam: homeTeam.trim(),
    awayTeam: awayTeam.trim(),
    market: market.trim(),
    odd,
  };
}

// Parse full ticket text into structured data
export function parseTicketText(text: string, postId: string): FbScrapedTicket | null {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // Must contain TODAY TICKET marker
  const hasTodayTicket = lines.some((l) =>
    l.toUpperCase().includes('TODAY TICKET')
  );
  // Skip VIP posts (have photo + "VIP WIN")
  const isVip = lines.some((l) => l.toUpperCase().includes('VIP WIN'));
  if (!hasTodayTicket || isVip) return null;

  const selections: FbScrapedSelection[] = [];
  let totalOdds = 0;

  for (const line of lines) {
    // Match line
    const sel = parseMatchLine(line);
    if (sel) {
      selections.push(sel);
      continue;
    }
    // Total odds line: "ODD: 3.11"
    const oddLine = line.match(/^ODD[:\s]+(\d+\.\d+)/i);
    if (oddLine) {
      totalOdds = parseFloat(oddLine[1]);
    }
  }

  if (selections.length === 0) return null;

  // Calculate total odds from selections if not found
  if (!totalOdds || totalOdds < 1) {
    totalOdds = Math.round(
      selections.reduce((acc, s) => acc * s.odd, 1) * 100
    ) / 100;
  }

  const today = new Date().toISOString().split('T')[0];

  return { date: today, postId, totalOdds, selections };
}

// Check if a post text is a WIN confirmation
function isWinPost(text: string): boolean {
  const upper = text.toUpperCase();
  // Must have WIN pattern but NOT be a VIP win post
  return (
    (upper.includes('#TODAY_TICKET') || upper.includes('TODAY TICKET')) &&
    (upper.includes('WIN') || upper.includes('POGODAK') || upper.includes('PROŠLO')) &&
    !upper.includes('VIP WIN')
  );
}

export async function scrapeFbTicket(): Promise<{
  ticket: FbScrapedTicket | null;
  isWin: boolean | null;
  winForDate: string | null;
}> {
  const email = process.env.FB_EMAIL;
  const password = process.env.FB_PASSWORD;

  if (!email || !password) {
    throw new Error('FB_EMAIL and FB_PASSWORD environment variables required');
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      locale: 'en-US',
    });
    const page = await context.newPage();

    // ── Login via mobile site (simpler form, works headless on Linux) ───────
    console.log('[FB] Logging in via m.facebook.com...');
    await page.goto('https://m.facebook.com/login', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(1500);

    // Accept cookies if present (EU GDPR wall)
    try {
      const cookieBtn = page.locator('button[data-cookiebanner="accept_button"], [data-testid="cookie-policy-manage-dialog-accept-button"]');
      if (await cookieBtn.first().isVisible({ timeout: 3000 })) {
        await cookieBtn.first().click();
        await page.waitForTimeout(1000);
      }
    } catch {}

    await page.waitForSelector('input[name="email"]', { timeout: 15_000 });
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="pass"]', password);
    await page.keyboard.press('Enter');
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(3000);

    console.log('[FB] Navigating to page...');
    await page.goto(FB_PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(4000);

    // Scroll to load more posts
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 1500));
      await page.waitForTimeout(1500);
    }

    // ── Extract posts ──────────────────────────────────────────────────────
    const posts = await page.evaluate(() => {
      const results: { text: string; postId: string }[] = [];

      // Mobile FB: articles or divs containing post text
      const candidates = Array.from(
        document.querySelectorAll('article, [role="article"], div[data-ft]')
      );

      // Fallback: find all divs with substantial text that mention ticket
      const allDivs = candidates.length > 0 ? candidates : Array.from(document.querySelectorAll('div'));

      for (const el of allDivs) {
        const text = el.textContent?.trim() ?? '';
        if (text.length < 50) continue;

        // Only process elements that mention ticket-related content
        const upper = text.toUpperCase();
        if (!upper.includes('TODAY TICKET') && !upper.includes('WIN') && !upper.includes('TICKET')) continue;

        // Avoid duplicates by checking if any parent is already in results
        const links = Array.from(el.querySelectorAll('a[href*="/posts/"], a[href*="story_fbid"], a[href*="permalink"]'));
        let postId = '';
        for (const link of links) {
          const href = link.getAttribute('href') ?? '';
          const m = href.match(/\/posts\/(\d+)|story_fbid=(\d+)|permalink\/(\d+)/);
          if (m) {
            postId = m[1] || m[2] || m[3];
            break;
          }
        }

        if (!results.some((r) => r.text === text.slice(0, 2000))) {
          results.push({ text: text.slice(0, 2000), postId });
        }
      }
      return results.slice(0, 20);
    });

    console.log(`[FB] Found ${posts.length} post(s) to check`);

    let todayTicket: FbScrapedTicket | null = null;
    let isWin: boolean | null = null;
    let winForDate: string | null = null;

    for (const post of posts) {
      // Check for WIN post first
      if (isWinPost(post.text) && !post.text.toUpperCase().includes('TODAY TICKET:')) {
        // This is a standalone WIN confirmation — note the date (today)
        isWin = true;
        winForDate = new Date().toISOString().split('T')[0];
        console.log('[FB] Found WIN confirmation post');
        continue;
      }

      // Try parse as ticket
      const ticket = parseTicketText(post.text, post.postId);
      if (ticket) {
        todayTicket = ticket;
        console.log(`[FB] Found TODAY TICKET: ${ticket.selections.length} selections, odds ${ticket.totalOdds}`);

        // Check if this same post also has WIN in it (i.e. it's a recap post)
        if (isWinPost(post.text)) {
          isWin = true;
          winForDate = ticket.date;
        }
        break;
      }
    }

    return { ticket: todayTicket, isWin, winForDate };
  } finally {
    await browser.close();
  }
}
