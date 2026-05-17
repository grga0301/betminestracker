import { parse } from 'node-html-parser';

async function main() {
  const res = await fetch('https://www.freetips.com/betting/bet-of-the-day/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  const html = await res.text();
  const root = parse(html);

  console.log('=== PAGE TITLE ===');
  console.log(root.querySelector('title')?.text);

  console.log('\n=== H1/H2 headings ===');
  root.querySelectorAll('h1,h2').forEach(h => console.log(h.tagName, JSON.stringify(h.text.trim().slice(0, 100))));

  console.log('\n=== Articles/Sections ===');
  const articles = root.querySelectorAll('article, .tip, .bet, .prediction, [class*="tip"], [class*="bet"], [class*="prediction"]');
  console.log('Found:', articles.length, 'elements');
  articles.slice(0, 3).forEach((a, i) => {
    console.log(`\n--- Element ${i} (${a.tagName} .${a.classNames}) ---`);
    console.log(a.text.trim().slice(0, 400));
  });

  console.log('\n=== Raw HTML snippet (first 3000 chars) ===');
  console.log(html.slice(0, 3000));
}

main().catch(console.error);
