// scripts/scrape-fb.ts — npm run scrape:fb
import { scrapeFbTicket } from '../src/lib/scraper/facebook';
import { saveFbTicket, resolveFbTicket, getPendingFbTickets } from '../src/lib/services/fbService';

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   Facebook IceHockeyBet Scraper        ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`  Date: ${new Date().toLocaleDateString('en-GB')}\n`);

  const today = new Date().toISOString().split('T')[0];

  // ── Auto-resolve stale PENDING tickets as LOSS ────────────────────────
  // Any ticket still PENDING from a previous date gets marked LOSS
  // (if it had won, #WIIIIIN would have been detected in a previous run)
  const pending = await getPendingFbTickets();
  for (const t of pending) {
    if (t.date < today) {
      const resolved = await resolveFbTicket(t.date, 'LOSS');
      if (resolved) {
        console.log(`  ✗ Auto-resolved ${t.date} as LOSS (no WIN post detected)`);
      }
    }
  }

  // ── Scrape FB page ────────────────────────────────────────────────────
  const { ticket, isWin, winForDate } = await scrapeFbTicket();

  // Handle WIN detection from #WIIIIIN post on the page
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
