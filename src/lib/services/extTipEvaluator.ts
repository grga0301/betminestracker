// src/lib/services/extTipEvaluator.ts
// Settles tips written in the vocabulary of TipOracle / FootyAccumulators / FootballPark
// ("Home Win", "No Goal", "Over 2.5", "Sweden Win & Over 2.5" …).
// Returns null for markets it cannot settle, so the tip stays PENDING instead of being counted as VOID.

type Result = 'WIN' | 'LOSS';

function evaluateLeg(leg: string, home: number, away: number): Result | null {
  const m = leg.toLowerCase().replace(/\s+/g, ' ').trim();
  const total = home + away;
  const both = home > 0 && away > 0;
  const w = (ok: boolean): Result => (ok ? 'WIN' : 'LOSS');

  // Half / team-specific markets cannot be settled from the full-time score alone.
  if (/half|1st|2nd|corner|card|\bfor\b|team (total|goals)/.test(m)) return null;

  const ou = m.match(/^(over|under)\s*(\d+(?:\.\d+)?)(?:\s*goals?)?$/);
  if (ou) return w(ou[1] === 'over' ? total > +ou[2] : total < +ou[2]);

  // "<team> to win to nil" (written as "home to win to nil" after team-name substitution)
  const nil = m.match(/^(home|away) (?:to )?win to nil$/);
  if (nil) return w(nil[1] === 'home' ? home > away && away === 0 : away > home && home === 0);

  // Whole/half-goal handicap on a team ("France -1"). A push (equal after handicap) can't be WIN/LOSS → null.
  const hc = m.match(/^(home|away) ([+-]\d+(?:\.[05])?)$/);
  if (hc) {
    const adj = (hc[1] === 'home' ? home - away : away - home) + +hc[2];
    return adj === 0 ? null : w(adj > 0);
  }

  if (m === 'home win' || m === 'home' || m === '1') return w(home > away);
  if (m === 'away win' || m === 'away' || m === '2') return w(away > home);
  if (m === 'draw' || m === 'x') return w(home === away);
  if (m === 'home or draw' || m === 'home win or draw' || m === '1x') return w(home >= away);
  if (m === 'draw or away' || m === 'draw or away win' || m === 'x2') return w(away >= home);
  if (m === 'home or away win' || m === 'home or away' || m === '12') return w(home !== away);

  if (m === 'both teams to score' || m === 'btts' || m === 'btts yes' || m === 'btts - yes' || m === 'goal') return w(both);
  if (m === 'no goal' || m === 'btts no' || m === 'btts - no' || m === 'both teams not to score') return w(!both);

  return null;
}

const loose = (n: string) =>
  n
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\brep\.?(\s+of)?\b/g, 'republic of')
    .replace(/[^a-z0-9]/g, '');

/** Replace a leading team name by "home"/"away" so "Sweden Win" reads like "Away Win". */
function withSides(leg: string, homeTeam?: string, awayTeam?: string): string {
  const l = leg.trim();
  const starts = (team?: string) => !!team && l.toLowerCase().startsWith(team.toLowerCase() + ' ');
  if (starts(homeTeam)) return 'home' + l.slice(homeTeam!.length);
  if (starts(awayTeam)) return 'away' + l.slice(awayTeam!.length);

  // Names written differently ("Rep. Ireland" vs "Republic of Ireland"): split "<name> <market…>" and compare loosely.
  const m = l.match(/^(.+?)\s+((?:to )?win\b.*|[+-]\d.*)$/i);
  if (m) {
    const name = loose(m[1]);
    const same = (team?: string) => {
      const t = team ? loose(team) : '';
      return !!t && (name === t || (Math.min(name.length, t.length) >= 5 && (name.includes(t) || t.includes(name))));
    };
    if (same(homeTeam)) return 'home ' + m[2];
    if (same(awayTeam)) return 'away ' + m[2];
  }
  return l;
}

/**
 * @param homeTeam/awayTeam optional — lets "Sweden Win & Over 2.5" resolve to away win + over 2.5.
 * Combined picks (legs joined by &, + or "and") win only when every leg wins.
 */
export function evaluateExtMarket(
  market: string,
  home: number,
  away: number,
  homeTeam?: string,
  awayTeam?: string
): Result | null {
  const legs = market.split(/\s*(?:&|\+|\band\b)\s*/i).filter(Boolean);
  const results = legs.map((l) => evaluateLeg(withSides(l, homeTeam, awayTeam).replace(/\s+to win$/i, ' win'), home, away));
  if (results.length === 0 || results.some((r) => r === null)) return null;
  return results.every((r) => r === 'WIN') ? 'WIN' : 'LOSS';
}
