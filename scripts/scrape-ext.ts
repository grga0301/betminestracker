// scripts/scrape-ext.ts — npm run scrape:ext
import { scrapeTipOracleToday, type ExtScrapedTip } from '../src/lib/scraper/tiporacle';
import { FA_CATEGORIES, scrapeFootyAccumulatorsCategory } from '../src/lib/scraper/footyaccumulators';
import { scrapeFootballParkToday } from '../src/lib/scraper/footballpark';
import { scrapeZulubetToday } from '../src/lib/scraper/zulubet';
import { saveExtTips, findNewExtTips } from '../src/lib/services/extTipService';
import { notifyNewTips } from '../src/lib/services/telegramService';
import { recordSourceRun } from '../src/lib/services/sourceStatusService';

// Source key (as in the ExtTip table / status tracking) for each entry of SOURCES below.
const SOURCE_KEY: Record<string, string> = {
  TipOracle: 'TIPORACLE',
  'FootyAccumulators/bet-of-the-day': 'FOOTYACCA',
  'FootyAccumulators/btts': 'FOOTYACCA_BTTS',
  'FootyAccumulators/over-2-5-trebles': 'FOOTYACCA_OVER25',
  FootballPark: 'FOOTBALLPARK',
  Zulubet: 'ZULUBET',
};

const SOURCES: [string, () => Promise<ExtScrapedTip[]>][] = [
  ['TipOracle', scrapeTipOracleToday],
  ...FA_CATEGORIES.map(
    (c): [string, () => Promise<ExtScrapedTip[]>] => [`FootyAccumulators/${c.path}`, () => scrapeFootyAccumulatorsCategory(c)]
  ),
  ['FootballPark', scrapeFootballParkToday],
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
      const fresh = await findNewExtTips(tips);
      const added = tips.length > 0 ? await saveExtTips(tips) : 0;
      if (added > 0 && fresh.length > 0) {
        await notifyNewTips(fresh[0].source, fresh[0].date, fresh.map((t) => ({ ...t, market: t.pick || t.market, odd: t.odd })));
      }
      console.log(`  ✓ ${name}: ${tips.length} found, ${added} new\n`);
      ok++;
      // "Nothing found" counts as a failed run, except for the single Bet of the Day, which is often not published.
      const key = SOURCE_KEY[name] ?? name;
      if (tips.length === 0 && key !== 'FOOTYACCA') await recordSourceRun(key, false, 'no tips found');
      else await recordSourceRun(key, true);
    } catch (err) {
      console.error(`  ✗ ${name} failed:`, err instanceof Error ? err.message : err, '\n');
      await recordSourceRun(SOURCE_KEY[name] ?? name, false, err instanceof Error ? err.message : String(err));
    }
  }
  if (ok === 0) process.exit(1); // one source failing must not hide the others
}

main();
