// One-off: does betmines.com keep a history of the Double / Risk bets?
import { parse } from 'node-html-parser';

async function get(url: string): Promise<string> {
  const params = new URLSearchParams({ token: process.env.SCRAPEDO_TOKEN!, url, render: 'true', customWait: '4000', timeout: '60000' });
  const res = await fetch(`https://api.scrape.do/?${params}`, { signal: AbortSignal.timeout(100_000) });
  return res.text();
}

(async () => {
  for (const url of ['https://betmines.com/football-predictions-yesterday']) {
    const html = await get(url);
    const root = parse(html);
    console.log('URL', url, 'bytes', html.length);
    console.log('TITLE', root.querySelector('title')?.text);
    console.log('HEADINGS:', root.querySelectorAll('h1,h2,h3').map((h) => `${h.tagName}:${h.text.trim().slice(0, 50)}`).join(' | '));
    console.log('fixtures:', root.querySelectorAll('.daily-bet-fixture-content').length, 'with score:', root.querySelectorAll('.daily-bet-fixture-content--with-score').length);
    const links = root.querySelectorAll('a').map((a) => `${a.text.trim().slice(0, 25)} -> ${a.getAttribute('href')}`);
    console.log('LINKS with date/archive:', links.filter((l) => /20\d\d|archive|history|date|calendar|daily-bet/i.test(l)).slice(0, 20).join('\n   '));
    const dates = root.querySelectorAll('.daily-bet-list-header p').map((p) => p.text.trim());
    console.log('LIST HEADER DATES:', dates.slice(0, 6).join(' | '));
  }
})().catch((e) => { console.error(e); process.exit(1); });
