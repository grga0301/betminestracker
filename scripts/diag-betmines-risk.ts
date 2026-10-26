// One-off: shows the structure of the "Risk" section and any history links on betmines.com/daily-bets-football.
import { parse } from 'node-html-parser';
import { fetchBetMinesViaScrapeDo } from '../src/lib/scraper/betmines';

(async () => {
  const html = await fetchBetMinesViaScrapeDo(process.env.SCRAPEDO_TOKEN!);
  const root = parse(html);
  console.log('HTML bytes:', html.length);
  console.log('HEADINGS:', root.querySelectorAll('h1,h2,h3').map((h) => `${h.tagName}:${h.text.trim().slice(0, 40)}`).join(' | '));
  const links = root.querySelectorAll('a').map((a) => `${a.text.trim().slice(0, 30)} -> ${a.getAttribute('href')}`);
  console.log('LINKS (history/result/past/archive):', links.filter((l) => /histor|result|past|archive|previous|yesterday|stat/i.test(l)).slice(0, 25).join('\n   '));
  const risk = root.querySelectorAll('h2,h3').find((h) => h.text.trim().toLowerCase().startsWith('risk'));
  if (!risk) { console.log('NO RISK HEADING'); return; }
  const container = risk.parentNode as any;
  const txt = (container.outerHTML as string).replace(/\s+/g, ' ');
  console.log('RISK CONTAINER LENGTH:', txt.length);
  console.log('RISK HTML (first 5000):\n' + txt.slice(0, 5000));
})().catch((e) => { console.error(e); process.exit(1); });
