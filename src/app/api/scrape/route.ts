// src/app/api/scrape/route.ts

import { NextResponse } from 'next/server';
import { scrapeTodaysDouble } from '@/lib/scraper/betmines';
import { saveDouble } from '@/lib/services/doubleService';

export async function POST() {
  try {
    console.log('[API /scrape] Starting scrape...');
    const scraped = await scrapeTodaysDouble();

    if (!scraped) {
      return NextResponse.json({ error: 'No double found for today' }, { status: 404 });
    }

    const result = await saveDouble(scraped);

    if (!result) {
      return NextResponse.json({
        message: 'Double for today already exists in database.',
        alreadyExists: true,
        date: scraped.date,
      });
    }

    return NextResponse.json({
      message: 'Double scraped and saved successfully.',
      id: result.id,
      date: scraped.date,
      selections: scraped.selections.length,
      totalOdds: scraped.totalOdds,
    });
  } catch (err) {
    console.error('[API /scrape]', err);
    return NextResponse.json(
      { error: `Scrape failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
