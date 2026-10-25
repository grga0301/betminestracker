// scripts/scrape-ft.ts — npm run scrape:ft
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
  if (alreadyExists) {
    console.log(`\n  ℹ Tip for ${tip.date} already exists.`);
  } else if (saved) {
    console.log(`\n  ✓ Tip saved for ${tip.date}`);
  }
}

main().catch((err) => {
  console.error('✗ scrape-ft failed:', err);
  process.exit(1);
});
