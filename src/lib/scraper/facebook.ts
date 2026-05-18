// src/lib/scraper/facebook.ts
// Scrapes IceHockeyBet Facebook page: mbasic (no auth) → Playwright+cookies fallback
import { chromium } from 'playwright';
import { parse as parseHtml } from 'node-html-parser';

const FB_PAGE_SLUG = 'IceHockeyBet';
const FB_PAGE_URL = `https://m.facebook.com/${FB_PAGE_SLUG}`;

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

// ── Shared parsing logic ──────────────────────────────────────────────────────

function extractTicketFromText(
  pageText: string,
  postIds: string[]
): { ticket: FbScrapedTicket | null; isWin: boolean | null; winForDate: string | null } {
  const upperPage = pageText.toUpperCase();
  const posts: { text: string; postId: string }[] = [];

  const firstIdx = upperPage.search(/TODAY[_ ]TICKET/);
  if (firstIdx !== -1) {
    const afterFirst = upperPage.indexOf('TODAY_TICKET', firstIdx + 1);
    const afterFirstB = upperPage.indexOf('TODAY TICKET', firstIdx + 1);
    const nextOccurrence = Math.min(
      afterFirst === -1 ? Infinity : afterFirst,
      afterFirstB === -1 ? Infinity : afterFirstB
    );
    const end = nextOccurrence === Infinity
      ? Math.min(pageText.length, firstIdx + 900)
      : nextOccurrence;

    // Check timestamp in the 300 chars BEFORE TODAY_TICKET (where FB puts "· 8 h ·" or "· 1 d. ·")
    const before = pageText.slice(Math.max(0, firstIdx - 300), firstIdx);
    const isOldPost = /·\s*\d+\s*d[.\s·]/i.test(before);
    if (isOldPost) {
      console.log('[FB] Post is from a previous day (timestamp check) — skipping');
    } else {
      posts.push({ text: pageText.slice(firstIdx, end), postId: postIds[0] ?? '' });
    }
  }

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
    const ticket = parseTicketText(post.text, post.postId);
    if (ticket) {
      todayTicket = ticket;
      console.log(`[FB] Found TODAY TICKET: ${ticket.selections.length} selections, odds ${ticket.totalOdds}`);
      if (isWinPost(post.text)) {
        isWin = true;
        winForDate = ticket.date;
      }
      break;
    }

    if (isWinPost(post.text)) {
      isWin = true;
      winForDate = new Date().toISOString().split('T')[0];
      console.log('[FB] Found WIN confirmation post');
    }
  }

  return { ticket: todayTicket, isWin, winForDate };
}

// ── mbasic.facebook.com (no auth, public pages) ──────────────────────────────

async function fetchFromMbasic(): Promise<{ pageText: string; postIds: string[] } | null> {
  try {
    const res = await fetch(`https://mbasic.facebook.com/${FB_PAGE_SLUG}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.log(`[FB] mbasic HTTP ${res.status}`);
      return null;
    }
    const html = await res.text();
    const root = parseHtml(html);

    // Login wall detection — mbasic redirects to /login if page is not public
    const bodyText = root.querySelector('body')?.text ?? '';
    if (bodyText.length < 500 || /log\s*in to facebook/i.test(bodyText)) {
      console.log('[FB] mbasic: login wall detected — page not accessible without auth');
      return null;
    }

    // Extract post IDs from links
    const postIds: string[] = [];
    for (const a of root.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href') ?? '';
      const m = href.match(/\/posts\/(\d+)|story_fbid=(\d+)|permalink\/(\d+)/);
      if (m) postIds.push(m[1] || m[2] || m[3]);
    }

    console.log(`[FB] mbasic: text length ${bodyText.length}, post IDs: ${[...new Set(postIds)].length}`);
    return { pageText: bodyText, postIds: [...new Set(postIds)] };
  } catch (e) {
    console.log(`[FB] mbasic error: ${e}`);
    return null;
  }
}

// ── Main scraper ──────────────────────────────────────────────────────────────

export async function scrapeFbTicket(): Promise<{
  ticket: FbScrapedTicket | null;
  isWin: boolean | null;
  winForDate: string | null;
}> {
  // ── 1. Try mbasic.facebook.com without authentication ────────────────────
  console.log('[FB] Trying mbasic.facebook.com (no auth)...');
  const mbasic = await fetchFromMbasic();
  if (mbasic && mbasic.pageText.toUpperCase().includes('TODAY')) {
    console.log('[FB] mbasic succeeded — parsing posts without Playwright');
    return extractTicketFromText(mbasic.pageText, mbasic.postIds);
  }

  // ── 2. Fallback: Playwright + cookies ────────────────────────────────────
  console.log('[FB] mbasic did not find ticket — falling back to Playwright+cookies');

  const cookiesJson = process.env.FB_COOKIES;
  if (!cookiesJson) {
    throw new Error('FB_COOKIES environment variable required (mbasic failed and no cookies set)');
  }

  let rawCookies: Record<string, unknown>[];
  try {
    rawCookies = JSON.parse(cookiesJson);
  } catch {
    throw new Error('FB_COOKIES is not valid JSON');
  }

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

    await context.addCookies(cookies);
    console.log(`[FB] Loaded ${cookies.length} cookies — skipping login`);

    const page = await context.newPage();

    console.log('[FB] Navigating to page...');
    await page.goto(FB_PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 40_000 });
    await page.waitForTimeout(4000);

    const pageUrl = page.url();
    console.log(`[FB] FB page URL: ${pageUrl}`);

    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 1500));
      await page.waitForTimeout(1500);
    }

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

    if (pageText.length < 1000 && !pageText.toUpperCase().includes('TODAY')) {
      throw new Error('FB cookies expired or invalidated — re-export from browser and update FB_COOKIES secret');
    }

    return extractTicketFromText(pageText, postIds);
  } finally {
    await browser.close();
  }
}
