// scripts/scrape-ext.ts — npm run scrape:ext
import { scrapeTipOracleToday, type ExtScrapedTip } from '../src/lib/scraper/tiporacle';
import { FA_CATEGORIES, scrapeFootyAccumulatorsCategory } from '../src/lib/scraper/footyaccumulators';
import { scrapeFootballParkToday } from '../src/lib/scraper/footballpark';
import { scrapeZulubetToday } from '../src/lib/scraper/zulubet';
import { scrapeFootballSuperToday } from '../src/lib/scraper/footballsuper';
import { kickoffMsFrom } from '../src/lib/services/fstResultFetcher';
import { saveExtTips, dropRecentRepeats } from '../src/lib/services/extTipService';

const SOURCES: [string, () => Promise<ExtScrapedTip[]>][] = [
  ['TipOracle', scrapeTipOracleToday],
  ...FA_CATEGORIES.map(
    (c): [string, () => Promise<ExtScrapedTip[]>] => [`FootyAccumulators/${c.path}`, () => scrapeFootyAccumulatorsCategory(c)]
  ),
  ['FootballPark', scrapeFootballParkToday],
  [
    'FootballSuper',
    async () => {
      // Store only picks whose match has not started yet (clock read as UTC: UK time, at most 1 h off).
      const upcoming = (await scrapeFootballSuperToday()).filter((t) => {
        const ko = kickoffMsFrom(t.date, t.kickoff);
        if (ko !== undefined && ko <= Date.now()) console.log(`  (skipping ${t.homeTeam} vs ${t.awayTeam}: kickoff ${t.kickoff} has passed)`);
        return ko === undefined || ko > Date.now();
      });
      return dropRecentRepeats(upcoming);
    },
  ],
  ['Zulubet', scrapeZulubetToday],
];

async function main() {
  let ok = 0;
  for (const [name, scrape] of SOURCES) {
    console.log(`── ${name} ──`);
    try {
      const tips = await scrape();
      for (const t of tips) {
        console.log(`  ${t.rank}. ${t.homeTeam} vs ${t.awayTeam} | ${t.market} @${t.odd} | ${t.date} ${t.kickoff}${t.legs ? ` | ${t.legs.length} legs` : ''}`);
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
