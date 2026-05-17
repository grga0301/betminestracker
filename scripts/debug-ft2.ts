import { parse } from 'node-html-parser';

async function main() {
  const res = await fetch('https://www.freetips.com/betting/bet-of-the-day/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    },
  });
  const html = await res.text();
  const root = parse(html);

  // Find all tables
  const tables = root.querySelectorAll('table');
  console.log('Tables found:', tables.length);
  tables.slice(0, 3).forEach((t, i) => {
    console.log(`\n--- Table ${i} ---`);
    console.log(t.text.trim().slice(0, 500));
  });

  // Find divs with match/team content
  console.log('\n=== Looking for match data ===');
  const divs = root.querySelectorAll('div');
  for (const div of divs) {
    const text = div.text.trim();
    if (text.includes('vs') && text.length < 300 && text.length > 20) {
      console.log(`[${div.classNames}]`, text.slice(0, 200));
    }
  }

  // Find any element with odds-like content
  console.log('\n=== Elements with odds ===');
  for (const el of root.querySelectorAll('*')) {
    const text = el.text.trim();
    if (/\d+\/\d+|\d+\.\d{2}/.test(text) && text.length < 100 && el.childNodes.length <= 2) {
      console.log(`<${el.tagName} class="${el.classNames}">`, text);
    }
  }
}

main().catch(console.error);
