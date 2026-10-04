// scripts/backtest-zulu.ts — npx tsx scripts/backtest-zulu.ts [days=30]
import { fetchZulubetDay, selectZuluPicks } from '../src/lib/scraper/zulubet';

async function main() {
  const days = parseInt(process.argv[2] ?? '30', 10);
  let w = 0, l = 0, profit = 0, odds = 0, daysWithData = 0;
  const lines: string[] = [];
  for (let i = 1; i <= days; i++) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    let rows;
    try { rows = (await fetchZulubetDay(d)).filter((r) => r.kickoffIso.startsWith(d) && r.score); } catch { continue; }
    if (rows.length === 0) continue;
    daysWithData++;
    const picks = selectZuluPicks(rows);
    const res = picks.map((p) => {
      const { homeScore: h, awayScore: a } = p.score!;
      const out = h > a ? '1' : h < a ? '2' : 'X';
      const o = p.odds[p.tip === '1' ? 0 : p.tip === 'X' ? 1 : 2];
      const win = out === p.tip;
      win ? (w++, (profit += o - 1)) : (l++, (profit -= 1));
      odds += o;
      return `${p.tip}@${o}${win ? 'W' : 'L'}`;
    });
    lines.push(`${d} finished=${rows.length} ${res.join(' ')}`);
    await new Promise((r) => setTimeout(r, 800));
  }
  console.log(lines.join('\n'));
  const n = w + l;
  console.log(`\ndays with data: ${daysWithData} | ${w}W ${l}L of ${n} → ${(100 * w / n).toFixed(1)}% | avg odd ${(odds / n).toFixed(2)} | profit ${profit.toFixed(2)}u ROI ${(100 * profit / n).toFixed(1)}%`);
}
main();
