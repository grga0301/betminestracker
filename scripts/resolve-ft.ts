// scripts/resolve-ft.ts — npm run resolve:ft
import { getPendingFtTips, updateFtTipResult, getAllFtTips } from '../src/lib/services/ftService';
import { sendTelegramMessage } from '../src/lib/services/telegramService';
import { fetchScoreFromSportsDB } from '../src/lib/services/fstResultFetcher';
import { evaluateWithGemini } from '../src/lib/services/geminiEvaluator';

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║  FreeTips.com Bet of Day - RESOLVER    ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`  Date: ${new Date().toLocaleDateString('en-GB')}\n`);

  const pending = await getPendingFtTips();

  if (pending.length === 0) {
    console.log('✓ No pending FT tips. All done!\n');
    process.exit(0);
  }

  console.log(`Found ${pending.length} pending FT tip(s)\n`);

  for (const tip of pending) {
    console.log(`─── FT Tip ${tip.date}: ${tip.homeTeam} vs ${tip.awayTeam} ───`);
    console.log(`    Pick: ${tip.pick} | Market: ${tip.market}`);

    const score = await fetchScoreFromSportsDB(tip.homeTeam, tip.awayTeam, tip.date);

    if (!score) {
      console.log('  ⏳ Result not found — keeping PENDING\n');
      continue;
    }

    const status = await evaluateWithGemini(
      tip.market,
      tip.pick,
      tip.homeTeam,
      tip.awayTeam,
      score.homeScore,
      score.awayScore,
    );

    await updateFtTipResult(tip.id, status, score.homeScore, score.awayScore);

    const icon = status === 'WIN' ? '🟢' : status === 'LOSS' ? '🔴' : '⚫';
    console.log(`  ${icon} Result: ${score.homeScore}-${score.awayScore} → ${status}\n`);
  }

  // Summary
  const all = await getAllFtTips();
  const wins = all.filter((t) => t.status === 'WIN').length;
  const losses = all.filter((t) => t.status === 'LOSS').length;
  const stillPending = all.filter((t) => t.status === 'PENDING').length;

  console.log('─────────────────────────────────────────');
  console.log(`FT Summary: ${wins}W / ${losses}L / ${stillPending} pending`);
  if (wins + losses > 0) {
    console.log(`Win rate: ${((wins / (wins + losses)) * 100).toFixed(1)}%`);
  }

  // Telegram alert after 4+ consecutive losses
  const resolved = all.filter((t) => t.status !== 'PENDING');
  let lossStreak = 0;
  for (const t of resolved) {
    if (t.status === 'LOSS') lossStreak++;
    else break;
  }
  console.log(`Current FT loss streak: ${lossStreak}`);

  if (lossStreak >= 4) {
    const winRate = wins + losses > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : '0.0';
    await sendTelegramMessage(
      `🚨 <b>FreeTips.com — Upozorenje!</b>\n\n` +
      `❌ Trenutni niz poraza: <b>${lossStreak} zaredom</b>\n\n` +
      `📊 Statistika:\n` +
      `• Pobjede: ${wins}\n` +
      `• Porazi: ${losses}\n` +
      `• Win rate: ${winRate}%\n\n` +
      `🔗 betminestracker.vercel.app`
    );
  }
}

main().catch((err) => {
  console.error('✗ resolve-ft failed:', err);
  process.exit(1);
});
