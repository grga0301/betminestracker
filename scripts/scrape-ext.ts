// scripts/scrape-ext.ts — npm run scrape:ext
import { scrapeTipOracleToday, type ExtScrapedTip } from '../src/lib/scraper/tiporacle';
import { scrapeFootyAccumulatorsToday } from '../src/lib/scraper/footyaccumulators';
import { scrapeFootballParkToday } from '../src/lib/scraper/footballpark';
import { saveExtTips } from '../src/lib/services/extTipService';

const SOURCES: [string, () => Promise<ExtScrapedTip[]>][] = [
  ['TipOracle', scrapeTipOracleToday],
  ['FootyAccumulators', scrapeFootyAccumulatorsToday],
  ['FootballPark', scrapeFootballParkToday],
];

async function main() {
  let ok = 0;
  for (const [name, scrape] of SOURCES) {
    console.log(`── ${name} ──`);
    try {
      const tips = await scrape();
      for (const t of tips) {
        console.log(`  ${t.rank}. ${t.homeTeam} vs ${t.awayTeam} | ${t.market} @${t.odd} | ${t.date} ${t.kickoff}`);
      }
      const added = tips.length > 0 ? await saveExtTips(tips) : 0;
      console.log(`  ✓ ${name}: ${tips.length} found, ${added} new\n`);
      ok++;
    } catch (err) {
      console.error(`  ✗ ${name} failed:`, err instanceof Error ? err.message : err, '\n');
    }
  }
  if (ok === 0) process.exit(1); // one source failing must not hide the others
}

main();
