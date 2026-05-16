// scripts/debug-fst2.ts
// Dumps HTML around the "Bet of the Day Tip" section
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

  console.log('Opening freesupertips...');
  await page.goto('https://www.freesupertips.com/bet-of-the-day-tips/', {
    waitUntil: 'networkidle',
    timeout: 60_000,
  });
  await page.waitForTimeout(5000);

  const data = await page.evaluate(() => {
    // 1. Find all h2 elements and their text
    const h2s = Array.from(document.querySelectorAll('h2')).map(h => ({
      text: h.textContent?.trim(),
      parentClass: h.parentElement?.className,
      parentTag: h.parentElement?.tagName,
      parentHTML: h.parentElement?.outerHTML?.slice(0, 800),
    }));

    // 2. Find all elements with class Leg
    const legs = Array.from(document.querySelectorAll('.Leg')).map(el => ({
      html: el.outerHTML.slice(0, 1000),
      text: el.textContent?.trim().slice(0, 300),
    }));

    // 3. Find TipCell elements
    const tipCells = Array.from(document.querySelectorAll('.TipCell')).map(el => ({
      html: el.outerHTML.slice(0, 800),
      text: el.textContent?.trim().slice(0, 200),
    }));

    // 4. Find the specific "Bet of the Day Tip" h2 and dump its entire ancestor chain
    const betOfDayH2 = Array.from(document.querySelectorAll('h2')).find(h =>
      h.textContent?.trim().toLowerCase().includes('bet of the day tip')
    );

    let ancestorDump = '';
    if (betOfDayH2) {
      let el: Element | null = betOfDayH2;
      for (let i = 0; i < 8; i++) {
        el = el?.parentElement ?? null;
        if (!el) break;
        ancestorDump += `\n--- Level ${i+1}: <${el.tagName.toLowerCase()} class="${el.className}">\n`;
        ancestorDump += el.outerHTML.slice(0, 600) + '\n';
      }
    }

    // 5. Find elements with "at " text pattern
    const atElements = Array.from(document.querySelectorAll('*')).filter(el => {
      const t = el.textContent?.trim() ?? '';
      return /^at\s+[A-Z]/.test(t) && el.children.length === 0 && t.length < 50;
    }).map(el => ({
      tag: el.tagName,
      class: el.className,
      text: el.textContent?.trim(),
      parentHTML: el.parentElement?.outerHTML?.slice(0, 400),
    }));

    // 6. Find elements with "to Win" or "to win"
    const toWinElements = Array.from(document.querySelectorAll('*')).filter(el => {
      const t = el.textContent?.trim() ?? '';
      return /to win/i.test(t) && el.children.length === 0 && t.length < 100;
    }).map(el => ({
      tag: el.tagName,
      class: el.className,
      text: el.textContent?.trim(),
      parentClass: el.parentElement?.className,
    }));

    return { h2s, legs, tipCells, ancestorDump, atElements, toWinElements };
  });

  writeFileSync(join('scripts', 'debug-fst2-output.txt'), JSON.stringify(data, null, 2), 'utf8');

  console.log('\n=== H2 ELEMENTS:');
  data.h2s.forEach(h => console.log(`  "${h.text}" | parent: <${h.parentTag} class="${h.parentClass}">`));

  console.log('\n=== LEG ELEMENTS:', data.legs.length);
  data.legs.slice(0, 3).forEach((l, i) => {
    console.log(`\n  Leg[${i}] text: ${l.text?.slice(0, 150)}`);
    console.log(`  Leg[${i}] html: ${l.html.slice(0, 300)}`);
  });

  console.log('\n=== TIP CELLS:', data.tipCells.length);
  data.tipCells.slice(0, 3).forEach((t, i) => {
    console.log(`\n  TipCell[${i}] text: ${t.text?.slice(0, 150)}`);
    console.log(`  TipCell[${i}] html: ${t.html.slice(0, 300)}`);
  });

  console.log('\n=== ANCESTOR DUMP of "Bet of the Day Tip" h2:');
  console.log(data.ancestorDump.slice(0, 3000));

  console.log('\n=== "at X" ELEMENTS:');
  data.atElements.slice(0, 5).forEach(e => console.log(`  <${e.tag} class="${e.class}"> "${e.text}"`));

  console.log('\n=== "to Win" ELEMENTS:');
  data.toWinElements.slice(0, 5).forEach(e => console.log(`  <${e.tag} class="${e.class}"> "${e.text}" | parent class: "${e.parentClass}"`));

  await browser.close();
}

main().catch(console.error);
