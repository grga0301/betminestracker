// scripts/debug-fst.ts
// Dumps the structure of freesupertips.com/bet-of-the-day-tips/
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join } from 'path';

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  });

  console.log('Opening https://www.freesupertips.com/bet-of-the-day-tips/ ...');
  await page.goto('https://www.freesupertips.com/bet-of-the-day-tips/', {
    waitUntil: 'networkidle',
    timeout: 60_000,
  });
  await page.waitForTimeout(4000);

  const data = await page.evaluate(() => {
    // 1. All unique class names
    const allClasses = new Set<string>();
    document.querySelectorAll('*').forEach(el => el.classList.forEach(c => allClasses.add(c)));

    // 2. Key selector hits
    const selectors = [
      'article', '.tip', '.bet', '.pick', '.prediction',
      '[class*="tip"]', '[class*="bet"]', '[class*="pick"]',
      '[class*="match"]', '[class*="team"]', '[class*="odd"]',
      '[class*="prediction"]', '[class*="card"]', '[class*="fixture"]',
      'h1', 'h2', 'h3', 'h4',
    ];
    const selectorHits: Record<string, { count: number; sample: string; html: string }> = {};
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        selectorHits[sel] = {
          count: els.length,
          sample: (els[0].textContent || '').trim().slice(0, 200),
          html: els[0].outerHTML.slice(0, 400),
        };
      }
    }

    return {
      title: document.title,
      url: window.location.href,
      bodyText: document.body.innerText.slice(0, 6000),
      allClasses: Array.from(allClasses).filter(c => c.length > 2).sort(),
      selectorHits,
    };
  });

  writeFileSync(join('scripts', 'debug-fst-text.txt'), data.bodyText, 'utf8');
  writeFileSync(join('scripts', 'debug-fst-classes.txt'), data.allClasses.join('\n'), 'utf8');

  console.log('\n=== TITLE:', data.title);
  console.log('=== URL:', data.url);
  console.log('\n=== SELECTOR HITS:');
  for (const [sel, info] of Object.entries(data.selectorHits)) {
    console.log(`\n  ${sel}: ${info.count} element(s)`);
    console.log(`    Text: ${info.sample.slice(0, 150).replace(/\n/g, ' ')}`);
    console.log(`    HTML: ${info.html.slice(0, 200)}`);
  }
  console.log('\n=== BODY TEXT (first 4000 chars):');
  console.log(data.bodyText.slice(0, 4000));

  await browser.close();
}

main().catch(console.error);
