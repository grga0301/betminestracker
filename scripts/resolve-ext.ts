// scripts/resolve-ext.ts — npm run resolve:ext
import { getPendingExtTips, updateExtTipResult, updateExtTipLegs } from '../src/lib/services/extTipService';
import { evaluateExtMarket } from '../src/lib/services/extTipEvaluator';
import { fetchScoreFromSportsDB } from '../src/lib/services/fstResultFetcher';
import { evaluateWithGemini } from '../src/lib/services/geminiEvaluator';
import type { ExtLeg } from '../src/lib/scraper/tiporacle';

const GIVE_UP_AFTER_DAYS = 7;
const MATCH_DURATION_MS = 2.5 * 3600 * 1000; // don't query results before a match can have finished

type Settled = 'WIN' | 'LOSS';

/** Settles one market from a final score: local rules first, Gemini only for unknown markets. */
async function settle(
  market: string, homeTeam: string, awayTeam: string, hs: number, as: number
): Promise<Settled | null> {
  const local = evaluateExtMarket(market, hs, as, homeTeam, awayTeam);
  if (local) return local;
  if (!process.env.GEMINI_API_KEY) return null;
  const g = await evaluateWithGemini(market, market, homeTeam, awayTeam, hs, as);
  return g === 'VOID' ? null : g; // Gemini answers VOID on API errors too — don't trust it to settle
}

async function resolveLegs(legs: ExtLeg[]): Promise<ExtLeg[]> {
  const out: ExtLeg[] = [];
  for (const leg of legs) {
    if (leg.status !== 'PENDING' || Date.parse(leg.kickoffIso) + MATCH_DURATION_MS > Date.now()) {
      out.push(leg);
      continue;
    }
    console.log(`    leg: ${leg.homeTeam} vs ${leg.awayTeam} | ${leg.market}`);
    const score = await fetchScoreFromSportsDB(leg.homeTeam, leg.awayTeam, leg.kickoffIso.slice(0, 10));
    if (!score) {
      console.log('      ⏳ no final score yet');
      out.push(leg);
      continue;
    }
    const status = await settle(leg.market, leg.homeTeam, leg.awayTeam, score.homeScore, score.awayScore);
    if (!status) {
      console.log(`      ⏳ could not settle "${leg.market}"`);
      out.push(leg);
      continue;
    }
    console.log(`      ${status === 'WIN' ? '🟢' : '🔴'} ${score.homeScore}-${score.awayScore} → ${status}`);
    out.push({ ...leg, status, homeScore: score.homeScore, awayScore: score.awayScore });
  }
  return out;
}

async function main() {
  const pending = await getPendingExtTips();
  console.log(`Found ${pending.length} pending external tip(s)\n`);
  const cutoff = new Date(Date.now() - GIVE_UP_AFTER_DAYS * 864e5).toISOString().slice(0, 10);

  for (const tip of pending) {
    if (tip.date < cutoff) continue;
    console.log(`─── ${tip.source} ${tip.date}: ${tip.homeTeam} vs ${tip.awayTeam} | ${tip.market}`);

    // Multi-match ticket: LOSS as soon as one leg loses, WIN only when every leg has won.
    if (tip.legs) {
      const legs = await resolveLegs(JSON.parse(tip.legs) as ExtLeg[]);
      const status = legs.some((l) => l.status === 'LOSS')
        ? 'LOSS'
        : legs.every((l) => l.status === 'WIN')
        ? 'WIN'
        : 'PENDING';
      await updateExtTipLegs(tip.id, status, legs);
      const done = legs.filter((l) => l.status !== 'PENDING').length;
      console.log(`  ${status === 'WIN' ? '🟢' : status === 'LOSS' ? '🔴' : '⏳'} ${status} (${done}/${legs.length} legs settled)\n`);
      continue;
    }

    const score = await fetchScoreFromSportsDB(tip.homeTeam, tip.awayTeam, tip.date);
    if (!score) {
      console.log('  ⏳ no final score yet — keeping PENDING\n');
      continue;
    }
    const status = await settle(tip.market, tip.homeTeam, tip.awayTeam, score.homeScore, score.awayScore);
    if (!status) {
      console.log(`  ⏳ could not settle "${tip.market}" — keeping PENDING\n`);
      continue;
    }
    await updateExtTipResult(tip.id, status, score.homeScore, score.awayScore);
    console.log(`  ${status === 'WIN' ? '🟢' : '🔴'} ${score.homeScore}-${score.awayScore} → ${status}\n`);
  }
}

main().catch((err) => {
  console.error('✗ resolve-ext failed:', err);
  process.exit(1);
});
