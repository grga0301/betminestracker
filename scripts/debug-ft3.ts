import { parse } from 'node-html-parser';

async function main() {
  const res = await fetch('https://www.freetips.com/betting/bet-of-the-day/', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  const html = await res.text();
  const root = parse(html);

  // Find the main BOD row - has cr-row class
  const rows = root.querySelectorAll('.cr-row, .nw-row, [class*="cr-row"]');
  console.log('cr-row elements:', rows.length);
  rows.slice(0, 2).forEach((r, i) => {
    console.log(`\n--- Row ${i} classes: ${r.classNames} ---`);
    console.log('TEXT:', r.text.trim().slice(0, 400));
    console.log('HTML:', r.outerHTML.slice(0, 800));
  });

  // plr-name element - seems to have pick + odds
  const plrNames = root.querySelectorAll('.plr-name');
  console.log('\n=== .plr-name elements ===');
  plrNames.forEach((el, i) => console.log(i, el.text.trim()));

  // ods element - odds
  const ods = root.querySelectorAll('.ods, .odds, [class*="odd"]');
  console.log('\n=== odds elements ===');
  ods.slice(0, 5).forEach((el, i) => console.log(i, el.classNames, el.text.trim()));

  // time/kickoff
  const times = root.querySelectorAll('time, .time, .kickoff, [class*="time"], [class*="kick"]');
  console.log('\n=== time elements ===');
  times.slice(0, 5).forEach((el, i) => console.log(i, el.classNames, el.text.trim()));

  // Look at the structure around "Inter Miami"
  for (const el of root.querySelectorAll('*')) {
    if (el.text.includes('Inter Miami') && el.text.length < 200 && el.childNodes.length <= 5) {
      console.log(`\n<${el.tagName} class="${el.classNames}">`, el.text.trim());
    }
  }
}

main().catch(console.error);
