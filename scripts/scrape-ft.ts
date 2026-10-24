// scripts/scrape-ft.ts — npm run scrape:ft
import { recordSourceRun } from '../src/lib/services/sourceStatusService';
import { notifyNewTips } from '../src/lib/services/telegramService';
import { scrapeFtBetOfTheDay } from '../src/lib/scraper/freetips';
import { saveFtTip } from '../src/lib/services/ftService';

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   FreeTips.com Bet of the Day Scraper  ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`  Date: ${new Date().toLocaleDateString('en-GB')}\n`);

  const tip = await scrapeFtBetOfTheDay();
  console.log(`  ✓ ${tip.homeTeam} vs ${tip.awayTeam}`);
  console.log(`     Pick: ${tip.pick} | Market: ${tip.market} | @${tip.odd} | KO: ${tip.kickoff}`);

  const { saved, alreadyExists } = await saveFtTip(tip);
  await recordSourceRun('FT', true);
  if (alreadyExists) {
    console.log(`\n  ℹ Tip for ${tip.date} already exists.`);
  } else if (saved) {
    console.log(`\n  ✓ Tip saved for ${tip.date}`);
    await notifyNewTips('FT', tip.date, [{ homeTeam: tip.homeTeam, awayTeam: tip.awayTeam, market: tip.pick, odd: tip.odd, kickoff: tip.kickoff }]);
  }
}

main().catch(async (err) => {
  console.error('✗ scrape-ft failed:', err);
  await recordSourceRun('FT', false, err instanceof Error ? err.message : String(err));
  process.exit(1);
});
