// scripts/scrape-ext.ts — npm run scrape:ext
import { scrapeForebetToday } from '../src/lib/scraper/forebet';
import { scrapeTipOracleToday, type ExtScrapedTip } from '../src/lib/scraper/tiporacle';
import { saveExtTips } from '../src/lib/services/extTipService';

async function run(name: string, scrape: () => Promise<ExtScrapedTip[]>): Promise<boolean> {
  try {
    const tips = await scrape();
    for (const t of tips) {
      console.log(`  ${t.rank}. ${t.homeTeam} vs ${t.awayTeam} | ${t.market} @${t.odd} | ${t.kickoff} | conf ${t.confidence ?? '-'}`);
    }
    const added = tips.length > 0 ? await saveExtTips(tips) : 0;
    console.log(`  ✓ ${name}: ${tips.length} found, ${added} new\n`);
    return true;
  } catch (err) {
    console.error(`  ✗ ${name} failed:`, err instanceof Error ? err.message : err, '\n');
    return false;
  }
}

async function main() {
  console.log('── Forebet ──');
  const a = await run('Forebet', scrapeForebetToday);
  console.log('── TipOracle ──');
  const b = await run('TipOracle', scrapeTipOracleToday);
  if (!a && !b) process.exit(1); // one source failing must not hide the other
}

main();
