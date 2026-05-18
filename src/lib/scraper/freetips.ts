import { parse } from 'node-html-parser';

function mapMarket(rawMarket: string, pick: string): string {
  const m = rawMarket.toLowerCase();
  const p = pick.toLowerCase();
  const full = `${m} ${p}`;

  if (m.includes('result') && m.includes('both teams')) {
    if (p.includes('& yes')) return 'BTTS';
    if (p.includes('& no')) return 'No BTTS';
  }

  if (m.includes('both teams to score') || m === 'btts') {
    return p.includes('no') ? 'No BTTS' : 'BTTS';
  }

  if (
    m.includes('over') || m.includes('under') ||
    m.includes('total goals') || m.includes('total goal') ||
    m.includes('number of goals') ||
    p.startsWith('over') || p.startsWith('under')
  ) {
    const isUnder = full.includes('under');
    // Extract line like 3.5, 2.5, 1.5 from combined text
    const lineMatch = full.match(/(\d+\.5|\d+\.\d+)/);
    if (lineMatch) return `${isUnder ? 'Under' : 'Over'} ${lineMatch[1]}`;
    // Integer line (e.g. "over 3 goals")
    const intMatch = full.match(/(\d+)\s*goal/);
    if (intMatch) return `${isUnder ? 'Under' : 'Over'} ${intMatch[1]}`;
    return isUnder ? 'Under Goals' : 'Over Goals';
  }

  if (m === 'home win' || m === 'home') return 'Home';
  if (m === 'away win' || m === 'away') return 'Away';
  if (m === 'draw') return 'Draw';
  if (m.includes('1x') || m.includes('home or draw')) return '1X';
  if (m.includes('x2') || m.includes('draw or away')) return 'X2';
  if (m.includes('12') || m.includes('home or away')) return '12';

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

  // Teams: .m-name → "Djurgarden v Sirius"
  const mName = root.querySelector('.m-name')?.text.trim() ?? '';
  const teamSplit = mName.split(/\s+v\s+/i);
  if (teamSplit.length < 2) throw new Error(`Could not parse teams from: "${mName}"`);
  const homeTeam = teamSplit[0].trim();
  const awayTeam = teamSplit[1].trim();

  // Market: first non-empty line of .match-name
  const matchNameLines = (root.querySelector('.match-name')?.text ?? '')
    .split('\n').map((l) => l.trim()).filter(Boolean);
  const rawMarket = matchNameLines[0] ?? 'Unknown';

  // Pick: .plr-name → "Over (6/4)" — strip fractional odds suffix
  const rawPick = (root.querySelector('.plr-name')?.text.trim() ?? '')
    .replace(/\s*\([^)]+\)\s*$/, '').trim();

  // If pick has no line number (e.g. just "Over"), search reason text for a goal line
  // Reason text is usually a <p> following the bet box — search full page text
  let pick = rawPick;
  if (/^(over|under)$/i.test(rawPick)) {
    const pageText = root.text;
    // Look for patterns like "over 3.5 goals", "3.5 goals", "over3.5", etc.
    const reasonLine = pageText.match(/(?:over|under)\s*([\d]+\.[\d]+)\s*goal/i)
      ?? pageText.match(/\b([\d]+\.5)\s*goals?\b/i);
    if (reasonLine) {
      pick = `${rawPick} ${reasonLine[1]}`;
    }
  }

  const market = mapMarket(rawMarket, pick);

  // Odds (decimal): .ods
  const oddText = root.querySelector('.ods')?.text.trim() ?? '0';
  const odd = parseFloat(oddText) || 0;

  // Kickoff: .betacctime — extract HH:MM
  const betaccText = root.querySelector('.betacctime')?.text.trim() ?? '';
  const timeMatch = betaccText.match(/(\d{1,2}:\d{2})/);
  const kickoff = timeMatch ? timeMatch[1] : '';

  const date = new Date().toISOString().split('T')[0];

  return { date, homeTeam, awayTeam, pick, market, kickoff, odd };
}
