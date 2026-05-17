import { parse } from 'node-html-parser';

export interface FtScrapedTip {
  date: string;
  homeTeam: string;
  awayTeam: string;
  pick: string;
  market: string;
  kickoff: string;
  odd: number;
}

export async function scrapeFtBetOfTheDay(): Promise<FtScrapedTip> {
  const res = await fetch('https://www.freetips.com/betting/bet-of-the-day/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  if (!res.ok) throw new Error(`freetips.com returned ${res.status}`);
  const html = await res.text();
  const root = parse(html);

  // Teams: .m-name → "Inter Miami v Portland Timbers"
  const mName = root.querySelector('.m-name')?.text.trim() ?? '';
  const teamSplit = mName.split(/\s+v\s+/i);
  if (teamSplit.length < 2) throw new Error(`Could not parse teams from: "${mName}"`);
  const homeTeam = teamSplit[0].trim();
  const awayTeam = teamSplit[1].trim();

  // Market: first line of .match-name (before the team line)
  const matchNameLines = (root.querySelector('.match-name')?.text ?? '')
    .split('\n').map((l) => l.trim()).filter(Boolean);
  const market = matchNameLines[0] ?? 'Unknown';

  // Pick: .plr-name → "Inter Miami & Yes (11/10)" — strip fractional odds
  const pick = (root.querySelector('.plr-name')?.text.trim() ?? '')
    .replace(/\s*\(\d+\/\d+\)\s*$/, '').trim();

  // Odds (decimal): .ods
  const oddText = root.querySelector('.ods')?.text.trim() ?? '0';
  const odd = parseFloat(oddText) || 0;

  // Kickoff: .betacctime contains "17 May 23:00 ..." — extract HH:MM
  const betaccText = root.querySelector('.betacctime')?.text.trim() ?? '';
  const timeMatch = betaccText.match(/(\d{1,2}:\d{2})/);
  const kickoff = timeMatch ? timeMatch[1] : '';

  const date = new Date().toISOString().split('T')[0];

  return { date, homeTeam, awayTeam, pick, market, kickoff, odd };
}
