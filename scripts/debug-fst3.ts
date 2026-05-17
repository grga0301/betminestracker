// scripts/debug-fst3.ts — find odds in BetGrid
import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  });
  await page.goto('https://www.freesupertips.com/bet-of-the-day-tips/', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(4000);

  const data = await page.evaluate(() => {
    // Full Card HTML (first one with Bet of the Day Tip)
    const h2 = Array.from(document.querySelectorAll('h2')).find(h => h.textContent?.includes('Bet of the Day Tip'));
    const card = h2?.closest('.Card');
    const cardHtml = card?.outerHTML?.slice(0, 4000) ?? 'NOT FOUND';

    // BetGrid elements
    const betGrids = Array.from(document.querySelectorAll('.BetGrid')).map(el => ({
      html: el.outerHTML.slice(0, 1500),
      text: el.textContent?.trim().slice(0, 500),
    }));

    // FreeBetCondensed (another possible odds container)
    const freeBets = Array.from(document.querySelectorAll('.FreeBetCondensed')).slice(0, 3).map(el => ({
      html: el.outerHTML.slice(0, 800),
      text: el.textContent?.trim().slice(0, 300),
    }));

    // Any element with "odds" text or decimal number like 3.40
    const oddsEls = Array.from(document.querySelectorAll('*')).filter(el => {
      const t = el.textContent?.trim() ?? '';
      return /^\d+\.\d{2}$/.test(t) && el.children.length === 0;
    }).slice(0, 10).map(el => ({
      tag: el.tagName,
      class: el.className,
      text: el.textContent?.trim(),
      parentClass: el.parentElement?.className,
      parentTag: el.parentElement?.tagName,
    }));

    return { cardHtml, betGrids, freeBets, oddsEls };
  });

  console.log('\n=== CARD HTML (first 3000 chars):');
  console.log(data.cardHtml.slice(0, 3000));

  console.log('\n=== BET GRIDS:', data.betGrids.length);
  data.betGrids.slice(0, 2).forEach((g, i) => {
    console.log(`\nBetGrid[${i}] text: ${g.text}`);
    console.log(`BetGrid[${i}] html: ${g.html.slice(0, 600)}`);
  });

  console.log('\n=== FREE BET CONDENSED:', data.freeBets.length);
  data.freeBets.slice(0, 2).forEach((f, i) => {
    console.log(`\nFreeBet[${i}] text: ${f.text}`);
    console.log(`FreeBet[${i}] html: ${f.html.slice(0, 400)}`);
  });

  console.log('\n=== DECIMAL NUMBER ELEMENTS (potential odds):');
  data.oddsEls.forEach(e => console.log(`  <${e.tag} class="${e.class}"> "${e.text}" | parent: <${e.parentTag} class="${e.parentClass}">`));

  await browser.close();
}

main().catch(console.error);
