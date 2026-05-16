// scripts/debug-scrape2.ts
// Dumps just the match card HTML from betmines daily bets page
import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  });
  await page.goto('https://betmines.com/daily-bets-football', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(4000);

  const data = await page.evaluate(() => {
    // 1. Show all daily-bet-* class elements and their full HTML
    const dailyEls = Array.from(document.querySelectorAll('[class*="daily-bet"]'));
    const dailyInfo = dailyEls.map(el => ({
      tag: el.tagName,
      classes: el.className,
      text: (el.textContent || '').trim().slice(0, 300),
      html: el.outerHTML.slice(0, 600),
    }));

    // 2. Find list headers (Double / Risk)
    const listHeaders = Array.from(document.querySelectorAll('.daily-bet-list-header'));
    const headerInfo = listHeaders.map(h => ({
      text: (h.textContent || '').trim(),
      parentTag: h.parentElement?.tagName,
      parentClass: h.parentElement?.className,
      siblings: Array.from(h.parentElement?.children || []).map(c => ({
        tag: c.tagName,
        class: c.className,
        text: (c.textContent || '').trim().slice(0, 100),
      })),
    }));

    // 3. Fixture rows
    const fixtureRows = Array.from(document.querySelectorAll('.daily-bet-fixture-row'));
    const rowInfo = fixtureRows.map(r => ({
      text: (r.textContent || '').trim().slice(0, 400),
      html: r.outerHTML.slice(0, 1000),
    }));

    // 4. Fixture content (with/without score)
    const fixtureContent = Array.from(document.querySelectorAll('.daily-bet-fixture-content, .daily-bet-fixture-content--with-score'));
    const contentInfo = fixtureContent.map(c => ({
      classes: c.className,
      text: (c.textContent || '').trim().slice(0, 400),
      html: c.outerHTML.slice(0, 1200),
    }));

    return { dailyInfo, headerInfo, fixtureRows: rowInfo, fixtureContent: contentInfo };
  });

  console.log('\n=== DAILY-BET-* ELEMENTS (' + data.dailyInfo.length + ') ===');
  data.dailyInfo.forEach((el, i) => {
    console.log(`\n[${i}] <${el.tag}> class="${el.classes}"`);
    console.log(`  text: ${el.text.slice(0, 150)}`);
  });

  console.log('\n\n=== LIST HEADERS ===');
  data.headerInfo.forEach((h, i) => {
    console.log(`\n[${i}] "${h.text}" parent: <${h.parentTag}> class="${h.parentClass}"`);
    console.log('  Siblings:');
    h.siblings.forEach(s => console.log(`    <${s.tag}> class="${s.class}" → "${s.text.slice(0, 80)}"`));
  });

  console.log('\n\n=== FIXTURE ROWS (' + data.fixtureRows.length + ') ===');
  data.fixtureRows.forEach((r, i) => {
    console.log(`\n[${i}] text: ${r.text.slice(0, 200)}`);
    console.log(`  HTML: ${r.html.slice(0, 400)}`);
  });

  console.log('\n\n=== FIXTURE CONTENT (' + data.fixtureContent.length + ') ===');
  data.fixtureContent.forEach((c, i) => {
    console.log(`\n[${i}] class="${c.classes}"`);
    console.log(`  text: ${c.text.slice(0, 300)}`);
    console.log(`  HTML: ${c.html.slice(0, 600)}`);
  });

  await browser.close();
}

main().catch(console.error);
