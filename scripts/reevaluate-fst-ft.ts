// One-off: re-settle every resolved FreeSuperTips / FreeTips / external tip with the current deterministic rules and
// report (and fix) the ones that change. Rows that cannot be re-evaluated deterministically are left untouched.
import { prisma } from '../src/lib/db/prisma';
import { evaluateStrict } from '../src/lib/services/geminiEvaluator';
import { evaluateExtMarket } from '../src/lib/services/extTipEvaluator';
import type { ExtLeg } from '../src/lib/scraper/tiporacle';

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
      }
    }
  }

  const ext = await prisma.extTip.findMany({ where: { status: { in: ['WIN', 'LOSS'] } }, orderBy: { date: 'asc' } });
  for (const t of ext) {
    if (t.legs) {
      const legs = JSON.parse(t.legs) as ExtLeg[];
      let ok = true;
      const results = legs.map((l) => {
        if (l.homeScore === null || l.awayScore === null) return l.status === 'PENDING' ? null : (ok = false, null);
        const r = evaluateExtMarket(l.market, l.homeScore, l.awayScore, l.homeTeam, l.awayTeam);
        if (!r) ok = false;
        return r;
      });
      if (!ok) continue;
      checked++;
      const now = results.some((r) => r === 'LOSS') ? 'LOSS' : results.every((r) => r === 'WIN') ? 'WIN' : null;
      if (now && now !== t.status) {
        console.log(`EXT #${t.id} ${t.source} ${t.date} ${t.market}: ${t.status} -> ${now}`);
        await prisma.extTip.update({ where: { id: t.id }, data: { status: now } });
        changed++;
      }
    } else {
      if (t.homeScore === null || t.awayScore === null) continue;
      const now = evaluateExtMarket(t.pick || t.market, t.homeScore, t.awayScore, t.homeTeam, t.awayTeam);
      if (!now) continue;
      checked++;
      if (now !== t.status) {
        console.log(`EXT #${t.id} ${t.source} ${t.date} ${t.homeTeam} ${t.homeScore}-${t.awayScore} ${t.awayTeam} | ${t.pick || t.market}: ${t.status} -> ${now}`);
        await prisma.extTip.update({ where: { id: t.id }, data: { status: now } });
        changed++;
      }
    }
  }
  console.log(`checked ${checked}, corrected ${changed}`);
  await prisma.$disconnect();
})();
