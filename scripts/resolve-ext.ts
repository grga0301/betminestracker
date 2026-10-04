// scripts/resolve-ext.ts — npm run resolve:ext
import { getPendingExtTips, updateExtTipResult } from '../src/lib/services/extTipService';
import { evaluateExtMarket } from '../src/lib/services/extTipEvaluator';
import { fetchScoreFromSportsDB } from '../src/lib/services/fstResultFetcher';
import { evaluateWithGemini } from '../src/lib/services/geminiEvaluator';

const GIVE_UP_AFTER_DAYS = 7;

async function main() {
  const pending = await getPendingExtTips();
  console.log(`Found ${pending.length} pending external tip(s)\n`);
  const cutoff = new Date(Date.now() - GIVE_UP_AFTER_DAYS * 864e5).toISOString().slice(0, 10);

  for (const tip of pending) {
    if (tip.date < cutoff) continue;
    console.log(`─── ${tip.source} ${tip.date}: ${tip.homeTeam} vs ${tip.awayTeam} | ${tip.market}`);

    const score = await fetchScoreFromSportsDB(tip.homeTeam, tip.awayTeam, tip.date);

    if (!score) {
      console.log('  ⏳ no final score yet — keeping PENDING\n');
      continue;
    }

    let status: 'WIN' | 'LOSS' | 'VOID' | null = evaluateExtMarket(tip.market, score.homeScore, score.awayScore, tip.homeTeam, tip.awayTeam);
    if (!status && process.env.GEMINI_API_KEY) {
      const g = await evaluateWithGemini(tip.market, tip.pick, tip.homeTeam, tip.awayTeam, score.homeScore, score.awayScore);
      status = g === 'VOID' ? null : g; // Gemini answers VOID on API errors too — don't trust it to settle
    }
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
