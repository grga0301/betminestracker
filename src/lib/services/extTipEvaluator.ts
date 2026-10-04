// src/lib/services/extTipEvaluator.ts
// Settles tips written in the vocabulary of Forebet / TipOracle ("Home Win", "No Goal", "Over 2.5" …).
// Returns null for markets it cannot settle, so the tip stays PENDING instead of being counted as VOID.

type Result = 'WIN' | 'LOSS';

export function evaluateExtMarket(market: string, home: number, away: number): Result | null {
  const m = market.toLowerCase().replace(/\s+/g, ' ').trim();
  const total = home + away;
  const both = home > 0 && away > 0;
  const w = (ok: boolean): Result => (ok ? 'WIN' : 'LOSS');

  // Combined picks ("Home Win & Over 2.5") are left to the caller's fallback.
  if (/[&+]|\band\b/.test(m)) return null;
  // Half / team-specific markets cannot be settled from the full-time score alone.
  if (/half|1st|2nd|corner|card|\bfor\b|team (total|goals)/.test(m)) return null;

  const ou = m.match(/^(over|under)\s*(\d+(?:\.\d+)?)(?:\s*goals?)?$/);
  if (ou) return w(ou[1] === 'over' ? total > +ou[2] : total < +ou[2]);

  if (m === 'home win' || m === 'home' || m === '1') return w(home > away);
  if (m === 'away win' || m === 'away' || m === '2') return w(away > home);
  if (m === 'draw' || m === 'x') return w(home === away);
  if (m === 'home or draw' || m === 'home win or draw' || m === '1x') return w(home >= away);
  if (m === 'draw or away' || m === 'draw or away win' || m === 'x2') return w(away >= home);
  if (m === 'home or away win' || m === 'home or away' || m === '12') return w(home !== away);

  if (m === 'both teams to score' || m === 'btts' || m === 'btts yes' || m === 'goal') return w(both);
  if (m === 'no goal' || m === 'btts no' || m === 'both teams not to score') return w(!both);

  return null;
}
