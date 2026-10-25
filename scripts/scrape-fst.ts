// scripts/scrape-fst.ts
// Run with: npm run scrape:fst
import { scrapeFstBetOfTheDay } from '../src/lib/scraper/freesupertips';
import { saveFstTip } from '../src/lib/services/fstService';

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║  FreeSuperTips Bet of the Day Scraper  ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`  Date: ${new Date().toLocaleDateString('en-GB')}\n`);

  console.log('  Scraping freesupertips.com...');
  const tip = await scrapeFstBetOfTheDay();

  if (!tip) {
    console.log('✗ Could not extract Bet of the Day tip.');
    process.exit(1);
  }

  console.log(`  ✓ Found tip for ${tip.date}:`);
  console.log(`     ${tip.homeTeam} vs ${tip.awayTeam}`);
  console.log(`     Pick: ${tip.pick}`);
  console.log(`     Market: ${tip.market}`);
  console.log(`     Kickoff: ${tip.kickoff}`);

  const { saved, alreadyExists } = await saveFstTip(tip);

  if (alreadyExists) {
    console.log(`\n  ℹ Already have FST tip for ${tip.date} — skipping.`);
  } else if (saved) {
    console.log(`\n  ✓ FST tip saved for ${tip.date}`);
  }
}

main().catch((err) => {
  console.error('✗ scrape-fst failed:', err);
  process.exit(1);
});
