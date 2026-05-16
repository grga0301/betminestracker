// scripts/scrape.ts
// Run with: npm run scrape
// Scrapes today's BetMines double and saves to SQLite

import { PrismaClient } from '@prisma/client';
import { scrapeTodaysDouble } from '../src/lib/scraper/betmines';

const prisma = new PrismaClient();

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   BetMines Double Tracker - SCRAPER    ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`  Date: ${new Date().toLocaleDateString('en-GB')}\n`);

  try {
    // Check for existing double today
    const today = new Date().toISOString().slice(0, 10);
    const existing = await prisma.betDouble.findUnique({ where: { date: today } });

    if (existing) {
      console.log(`✓ Double for ${today} already in database (id=${existing.id}).`);
      console.log('  Status:', existing.status);
      console.log('  Total Odds:', existing.totalOdds);
      console.log('\n  To re-scrape, delete today\'s record first: npm run db:studio');
      process.exit(0);
    }

    console.log('🔍 Scraping BetMines...\n');
    const scraped = await scrapeTodaysDouble();

    if (!scraped) {
      console.error('✗ No double found on BetMines today.');
      process.exit(1);
    }

    // Save to DB
    const created = await prisma.betDouble.create({
      data: {
        date: scraped.date,
        totalOdds: scraped.totalOdds,
        status: 'PENDING',
        selections: {
          create: scraped.selections.map((s) => ({
            homeTeam: s.homeTeam,
            awayTeam: s.awayTeam,
            market: s.market,
            line: s.line ?? null,
            odd: s.odd,
            league: s.league,
            country: s.country,
            kickoff: s.kickoff,
            resultStatus: 'PENDING',
          })),
        },
      },
      include: { selections: true },
    });

    console.log('✓ Saved to database!\n');
    console.log(`  ID:         ${created.id}`);
    console.log(`  Date:       ${created.date}`);
    console.log(`  Total Odds: ×${created.totalOdds.toFixed(2)}`);
    console.log(`  Status:     ${created.status}\n`);

    for (const sel of created.selections) {
      console.log(`  📌 ${sel.homeTeam} vs ${sel.awayTeam}`);
      console.log(`     Market: ${sel.market} @ ${sel.odd}`);
      console.log(`     League: ${sel.country} - ${sel.league}`);
      console.log('');
    }

    console.log('  Open http://localhost:3000 to view in UI');
  } catch (err) {
    console.error('✗ Scrape failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
