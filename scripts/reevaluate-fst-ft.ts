// One-off: re-settle every resolved FreeSuperTips / FreeTips tip with the fixed evaluator (combined picks such as
// "Bayern Munich and Both Teams To Score" used to be settled from the market label "BTTS" alone).
import { prisma } from '../src/lib/db/prisma';
import { evaluateStrict } from '../src/lib/services/geminiEvaluator';

(async () => {
  delete process.env.GEMINI_API_KEY; // deterministic rules only
  let checked = 0;
  let changed = 0;
  for (const [name, model] of [['FST', prisma.fstTip], ['FT', prisma.ftTip]] as const) {
    const tips: any[] = await (model as any).findMany({ where: { status: { in: ['WIN', 'LOSS'] } }, orderBy: { date: 'asc' } });
    for (const t of tips) {
      if (t.homeScore === null || t.awayScore === null) continue;
      checked++;
      const now = await evaluateStrict(t.market, t.homeTeam, t.awayTeam, t.homeScore, t.awayScore, null, t.pick);
      if (now && now !== t.status) {
        console.log(`${name} #${t.id} ${t.date} ${t.homeTeam} ${t.homeScore}-${t.awayScore} ${t.awayTeam} | ${t.market} / ${t.pick}: ${t.status} -> ${now}`);
        await (model as any).update({ where: { id: t.id }, data: { status: now } });
        changed++;
      } else if (!now) {
        console.log(`${name} #${t.id} ${t.date} ${t.homeTeam} vs ${t.awayTeam} | ${t.market} / ${t.pick}: cannot be re-evaluated (kept ${t.status})`);
      }
    }
  }
  console.log(`checked ${checked}, corrected ${changed}`);
  await prisma.$disconnect();
})();
