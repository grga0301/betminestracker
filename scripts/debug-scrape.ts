// scripts/debug-scrape.ts
// Dumps the raw page content from betmines.com/daily-bets-football
// Run: npx tsx scripts/debug-scrape.ts

import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join } from 'path';

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  });

  console.log('Opening https://betmines.com/daily-bets-football ...');
  await page.goto('https://betmines.com/daily-bets-football', {
    waitUntil: 'networkidle',
    timeout: 60_000,
  });
  await page.waitForTimeout(5000);

  const data = await page.evaluate(() => {
    // Dump ALL class names present on the page
    const allClasses = new Set<string>();
    document.querySelectorAll('*').forEach((el) => {
      el.classList.forEach((c) => allClasses.add(c));
    });

    // Snapshot of key selectors and their text
    const selectors = [
      'article', 'section', '.card', '[class*="tip"]', '[class*="bet"]',
      '[class*="pick"]', '[class*="match"]', '[class*="double"]',
      '[class*="prediction"]', '[class*="fixture"]', '[class*="game"]',
      '[class*="odd"]', '[class*="score"]', '[class*="team"]',
    ];

    const selectorHits: Record<string, { count: number; sample: string }> = {};
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        selectorHits[sel] = {
          count: els.length,
          sample: (els[0].textContent || '').trim().slice(0, 200),
        };
      }
    }

    return {
      title: document.title,
      url: window.location.href,
      bodyText: document.body.innerText.slice(0, 8000),
      bodyHtml: document.body.innerHTML.slice(0, 30000),
      allClasses: Array.from(allClasses).sort(),
      selectorHits,
    };
  });

  const outDir = join(process.cwd(), 'scripts');
  writeFileSync(join(outDir, 'debug-page-text.txt'), data.bodyText, 'utf8');
  writeFileSync(join(outDir, 'debug-page-html.html'), data.bodyHtml, 'utf8');
  writeFileSync(
    join(outDir, 'debug-selectors.json'),
    JSON.stringify({ title: data.title, url: data.url, selectorHits: data.selectorHits, allClasses: data.allClasses }, null, 2),
    'utf8'
  );

  console.log('\n=== TITLE:', data.title);
  console.log('=== URL:', data.url);
  console.log('\n=== SELECTOR HITS:');
  for (const [sel, info] of Object.entries(data.selectorHits)) {
    console.log(`  ${sel}: ${info.count} element(s)`);
    console.log(`    Sample: ${info.sample.slice(0, 120)}`);
  }
  console.log('\n=== ALL CSS CLASSES ON PAGE:');
  console.log(data.allClasses.join(', '));
  console.log('\n=== BODY TEXT (first 3000 chars):');
  console.log(data.bodyText.slice(0, 3000));

  console.log('\n✓ Full output saved to:');
  console.log('  scripts/debug-page-text.txt');
  console.log('  scripts/debug-page-html.html');
  console.log('  scripts/debug-selectors.json');

  await browser.close();
}

main().catch(console.error);
