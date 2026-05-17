import { parse } from 'node-html-parser';

// Map freetips.com market labels → internal evaluator format
function mapMarket(rawMarket: string, pick: string): string {
  const m = rawMarket.toLowerCase();
  const p = pick.toLowerCase();

  // Combined markets — derive from pick text (e.g. "Inter Miami & Yes")
  if (m.includes('result') && m.includes('both teams')) {
    // Pick: "Team & Yes" or "Draw & Yes" etc.
    if (p.includes('& yes')) {
      if (p.includes('draw')) return 'BTTS'; // draw + btts → evaluate BTTS only
      return 'BTTS'; // home/away + btts → evaluate BTTS (stricter but safer)
    }
    if (p.includes('& no')) return 'No BTTS';
  }

  if (m.includes('both teams to score') || m === 'btts') {
    return p.includes('no') ? 'No BTTS' : 'BTTS';
  }
  if (m.includes('over 2.5') || m.includes('over2.5')) return 'Over 2.5';
  if (m.includes('under 2.5') || m.includes('under2.5')) return 'Under 2.5';
  if (m.includes('over 3.5')) return 'Over 3.5';
  if (m.includes('under 3.5')) return 'Under 3.5';
  if (m.includes('over 1.5')) return 'Over 1.5';
  if (m.includes('under 1.5')) return 'Under 1.5';
  if (m === 'home win' || m === 'home') return 'Home';
  if (m === 'away win' || m === 'away') return 'Away';
  if (m === 'draw') return 'Draw';
  if (m.includes('1x') || m.includes('home or draw')) return '1X';
  if (m.includes('x2') || m.includes('draw or away')) return 'X2';
  if (m.includes('12') || m.includes('home or away')) return '12';

  // Return raw market as fallback — will log VOID warning
  return rawMarket;
}

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
  const rawMarket = matchNameLines[0] ?? 'Unknown';

  // Pick: .plr-name → "Inter Miami & Yes (11/10)" — strip fractional odds
  const pick = (root.querySelector('.plr-name')?.text.trim() ?? '')
    .replace(/\s*\(\d+\/\d+\)\s*$/, '').trim();

  // Map to evaluator-compatible market name
  const market = mapMarket(rawMarket, pick);

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
