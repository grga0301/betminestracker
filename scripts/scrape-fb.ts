// scripts/scrape-fb.ts — npm run scrape:fb
import { scrapeFbTicket } from '../src/lib/scraper/facebook';
import { saveFbTicket, resolveFbTicket } from '../src/lib/services/fbService';

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   Facebook IceHockeyBet Scraper        ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`  Date: ${new Date().toLocaleDateString('en-GB')}\n`);

  const { ticket, isWin, winForDate } = await scrapeFbTicket();

  // Handle WIN detection from standalone WIN post
  if (isWin && winForDate) {
    const resolved = await resolveFbTicket(winForDate, 'WIN');
    if (resolved) {
      console.log(`  🏆 Marked ticket ${winForDate} as WIN from page post`);
    }
  }

  if (!ticket) {
    console.log('  ℹ No TODAY TICKET post found for today.');
    process.exit(0);
  }

  console.log(`  ✓ Found ticket: ${ticket.selections.length} selections | Odds: ${ticket.totalOdds}`);
  ticket.selections.forEach((s) =>
    console.log(`     ${s.kickoff} ${s.homeTeam} - ${s.awayTeam} | ${s.market} @${s.odd}`)
  );

  const { saved, alreadyExists } = await saveFbTicket(ticket);
  if (alreadyExists) {
    console.log(`\n  ℹ Ticket for ${ticket.date} already exists.`);
  } else if (saved) {
    console.log(`\n  ✓ Ticket saved for ${ticket.date}`);
  }
}

main().catch((err) => {
  console.error('✗ scrape-fb failed:', err);
  process.exit(1);
});
