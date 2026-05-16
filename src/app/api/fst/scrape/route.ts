// src/app/api/fst/scrape/route.ts
// Runs directly on Vercel (no Playwright = no GitHub Actions needed)
import { NextResponse } from 'next/server';
import { scrapeFstBetOfTheDay } from '@/lib/scraper/freesupertips';
import { saveFstTip } from '@/lib/services/fstService';

export async function POST() {
  try {
    const tip = await scrapeFstBetOfTheDay();

    if (!tip) {
      return NextResponse.json({ error: 'Could not extract FST tip from page' }, { status: 500 });
    }

    const { saved, alreadyExists } = await saveFstTip(tip);

    return NextResponse.json({
      date: tip.date,
      homeTeam: tip.homeTeam,
      awayTeam: tip.awayTeam,
      pick: tip.pick,
      market: tip.market,
      odd: tip.odd,
      saved,
      alreadyExists,
    });
  } catch (err) {
    console.error('[API /fst/scrape]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
