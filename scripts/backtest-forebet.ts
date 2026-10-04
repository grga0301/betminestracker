// scripts/backtest-forebet.ts — npx tsx scripts/backtest-forebet.ts [days=21]
import { fetchForebetDay, selectForebetPicks } from '../src/lib/scraper/forebet';

async function main() {
  const days = parseInt(process.argv[2] ?? '21', 10);
  let w = 0, l = 0, profit = 0, oddsSum = 0;
  const byDay: string[] = [];
  for (let i = 1; i <= days; i++) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    let rows;
    try { rows = (await fetchForebetDay(d)).filter((r) => r.date === d); } catch (e) { byDay.push(`${d} ERR ${e}`); continue; }
    const finished = rows.filter((r) => r.score);
    const picks = selectForebetPicks(finished);
    const res = picks.map((p) => {
      const { homeScore: h, awayScore: a } = p.score!;
      const out = h > a ? '1' : h < a ? '2' : 'X';
      const win = out === p.pick;
      win ? (w++, (profit += p.odd - 1)) : (l++, (profit -= 1));
      oddsSum += p.odd;
      return `${p.homeTeam}-${p.awayTeam} ${p.pick}@${p.odd} ${h}-${a} ${win ? 'W' : 'L'}`;
    });
    byDay.push(`${d} rows=${rows.length} fin=${finished.length} | ${res.join(' ; ')}`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log(byDay.join('\n'));
  const n = w + l;
  console.log(`\nForebet top-3/day: ${w}W ${l}L of ${n} → ${(100 * w / n).toFixed(1)}% | avg odd ${(oddsSum / n).toFixed(2)} | flat-stake profit ${profit.toFixed(2)}u (ROI ${(100 * profit / n).toFixed(1)}%)`);
}
main();
