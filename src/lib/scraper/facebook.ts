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

// Parse a single match line: "20:00 Hannover - Nurnberg 1X&2-5 (1.50)"
function parseMatchLine(line: string): FbScrapedSelection | null {
  // Market is always the token just before (ODD) — greedy match away team up to that token
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

  // Must contain TODAY TICKET marker (with space or underscore)
  const hasTodayTicket = lines.some((l) => {
    const u = l.toUpperCase();
    return u.includes('TODAY_TICKET') || u.includes('TODAY TICKET');
  });
  // Skip VIP posts (have photo + "VIP WIN")
  const isVip = lines.some((l) => l.toUpperCase().includes('VIP WIN'));
  if (!hasTodayTicket || isVip) return null;

  const selections: FbScrapedSelection[] = [];
  let totalOdds = 0;

  for (const line of lines) {
    // Total odds line marks end of this post's selections
    const oddLine = line.match(/^ODD[:\s]+(\d+\.\d+)/i);
    if (oddLine) {
      totalOdds = parseFloat(oddLine[1]);
      break; // stop here — anything after is from the next post
    }
    // Match line
    const sel = parseMatchLine(line);
    if (sel) selections.push(sel);
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
// Requires the specific #WIIIIIN or POGODAK marker — plain "WIN" is too generic
function isWinPost(text: string): boolean {
  const upper = text.toUpperCase();
  return (upper.includes('WIIIIIN') || upper.includes('POGODAK')) && !upper.includes('VIP WIN');
}

export async function scrapeFbTicket(): Promise<{
  ticket: FbScrapedTicket | null;
  isWin: boolean | null;
  winForDate: string | null;
}> {
  const cookiesJson = process.env.FB_COOKIES;
  if (!cookiesJson) {
    throw new Error('FB_COOKIES environment variable required (export cookies from logged-in browser)');
  }

  let rawCookies: Record<string, unknown>[];
  try {
    rawCookies = JSON.parse(cookiesJson);
  } catch {
    throw new Error('FB_COOKIES is not valid JSON');
  }

  // Normalize sameSite to values Playwright accepts (Strict | Lax | None)
  const sameSiteMap: Record<string, 'Strict' | 'Lax' | 'None'> = {
    strict: 'Strict', lax: 'Lax', none: 'None',
    no_restriction: 'None', unspecified: 'Lax',
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cookies = rawCookies.map((c) => ({
    ...c,
    sameSite: sameSiteMap[(String(c.sameSite ?? '')).toLowerCase()] ?? 'Lax',
  })) as any[];

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

    // ── Load saved session cookies (no login / no 2FA needed) ────────────
    await context.addCookies(cookies);
    console.log(`[FB] Loaded ${cookies.length} cookies — skipping login`);

    const page = await context.newPage();

    console.log('[FB] Navigating to page...');
    await page.goto(FB_PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 40_000 });
    await page.waitForTimeout(4000);

    const pageUrl = page.url();
    console.log(`[FB] FB page URL: ${pageUrl}`);

    // Scroll to load more posts
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 1500));
      await page.waitForTimeout(1500);
    }

    // ── Extract posts via full page text (avoids mobile FB DOM quirks) ─────
    const { pageText, postIds } = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href*="/posts/"], a[href*="story_fbid"], a[href*="permalink"]'));
      const postIds: string[] = [];
      for (const a of links) {
        const href = a.getAttribute('href') ?? '';
        const m = href.match(/\/posts\/(\d+)|story_fbid=(\d+)|permalink\/(\d+)/);
        if (m) postIds.push(m[1] || m[2] || m[3]);
      }
      return {
        pageText: document.body.innerText ?? '',
        postIds: [...new Set(postIds)],
      };
    });

    console.log(`[FB] Page text length: ${pageText.length}, post IDs found: ${postIds.length}`);
    console.log(`[FB] Page text preview: ${pageText.slice(0, 400).replace(/\n/g, ' ')}`);

    // Find the first (= most recent) TODAY_TICKET post and extract only that post's text
    const upperPage = pageText.toUpperCase();
    const posts: { text: string; postId: string }[] = [];

    const firstIdx = upperPage.search(/TODAY[_ ]TICKET/);
    if (firstIdx !== -1) {
      // End the chunk at the next TODAY_TICKET occurrence (= next post), or 900 chars max
      // Find next occurrence after firstIdx
      const afterFirst = upperPage.indexOf('TODAY_TICKET', firstIdx + 1);
      const afterFirstB = upperPage.indexOf('TODAY TICKET', firstIdx + 1);
      const nextOccurrence = Math.min(
        afterFirst === -1 ? Infinity : afterFirst,
        afterFirstB === -1 ? Infinity : afterFirstB
      );
      const end = nextOccurrence === Infinity
        ? Math.min(pageText.length, firstIdx + 900)
        : nextOccurrence;

      posts.push({ text: pageText.slice(firstIdx, end), postId: postIds[0] ?? '' });
    }

    // Also check for standalone WIN post if no ticket found
    const winIdx = upperPage.indexOf('WIIIIIN');
    if (winIdx !== -1 && posts.length === 0) {
      const chunk = pageText.slice(Math.max(0, winIdx - 100), Math.min(pageText.length, winIdx + 400));
      posts.push({ text: chunk, postId: postIds[0] ?? '' });
    }

    console.log(`[FB] Found ${posts.length} post(s) to check`);
    if (posts.length > 0) {
      console.log(`[FB] First chunk preview: ${posts[0].text.slice(0, 300).replace(/\n/g, ' | ')}`);
    }

    let todayTicket: FbScrapedTicket | null = null;
    let isWin: boolean | null = null;
    let winForDate: string | null = null;

    for (const post of posts) {
      // Always try to parse as a ticket first
      const ticket = parseTicketText(post.text, post.postId);
      if (ticket) {
        todayTicket = ticket;
        console.log(`[FB] Found TODAY TICKET: ${ticket.selections.length} selections, odds ${ticket.totalOdds}`);
        // Check if a WIN confirmation is also visible on the same page chunk
        if (isWinPost(post.text)) {
          isWin = true;
          winForDate = ticket.date;
        }
        break;
      }

      // Not a ticket — check if it's a standalone WIN confirmation
      if (isWinPost(post.text)) {
        isWin = true;
        winForDate = new Date().toISOString().split('T')[0];
        console.log('[FB] Found WIN confirmation post');
      }
    }

    return { ticket: todayTicket, isWin, winForDate };
  } finally {
    await browser.close();
  }
}
