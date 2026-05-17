import { NextResponse } from 'next/server';
import { scrapeFtBetOfTheDay } from '@/lib/scraper/freetips';
import { saveFtTip } from '@/lib/services/ftService';

export async function POST() {
  try {
    const tip = await scrapeFtBetOfTheDay();
    const { saved, alreadyExists } = await saveFtTip(tip);
    return NextResponse.json({
      date: tip.date,
      homeTeam: tip.homeTeam,
      awayTeam: tip.awayTeam,
      pick: tip.pick,
      market: tip.market,
      kickoff: tip.kickoff,
      odd: tip.odd,
      saved,
      alreadyExists,
    });
  } catch (err) {
    console.error('[API /ft/scrape]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
