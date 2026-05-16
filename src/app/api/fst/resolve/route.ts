// src/app/api/fst/resolve/route.ts
// Runs directly on Vercel using fetch-only result sources (no Playwright)
import { NextResponse } from 'next/server';
import { getPendingFstTips, updateFstTipResult, getAllFstTips } from '@/lib/services/fstService';
import { fetchScoreFromSportsDB } from '@/lib/services/fstResultFetcher';
import { evaluateSelection } from '@/lib/services/resultEvaluator';

export async function POST() {
  try {
    const pending = await getPendingFstTips();

    if (pending.length === 0) {
      return NextResponse.json({ message: 'No pending FST tips.', resolved: 0 });
    }

    const results: { date: string; status: string; score?: string }[] = [];

    for (const tip of pending) {
      const score = await fetchScoreFromSportsDB(tip.homeTeam, tip.awayTeam, tip.date);

      if (!score) {
        results.push({ date: tip.date, status: 'PENDING' });
        continue;
      }

      const status = evaluateSelection({
        market: tip.market,
        line: null,
        homeScore: score.homeScore,
        awayScore: score.awayScore,
      });

      await updateFstTipResult(tip.id, score.homeScore, score.awayScore, status);
      results.push({
        date: tip.date,
        status,
        score: `${score.homeScore}-${score.awayScore}`,
      });
    }

    // Loss streak check
    const all = await getAllFstTips();
    const resolved = all.filter((t) => t.status !== 'PENDING');
    let lossStreak = 0;
    for (const t of resolved) {
      if (t.status === 'LOSS') lossStreak++;
      else break;
    }

    if (lossStreak >= 3) {
      const wins = all.filter((t) => t.status === 'WIN').length;
      const losses = all.filter((t) => t.status === 'LOSS').length;
      const winRate = wins + losses > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : '0.0';

      const token = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;
      if (token && chatId) {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            parse_mode: 'HTML',
            text:
              `🚨 <b>FreeSuperTips — Upozorenje!</b>\n\n` +
              `❌ Trenutni niz poraza: <b>${lossStreak} zaredom</b>\n\n` +
              `📊 Statistika:\n• Pobjede: ${wins}\n• Porazi: ${losses}\n• Win rate: ${winRate}%\n\n` +
              `🔗 betminestracker.vercel.app`,
          }),
        });
      }
    }

    const resolvedCount = results.filter((r) => r.status !== 'PENDING').length;
    return NextResponse.json({
      message: `Resolved ${resolvedCount}/${pending.length} tip(s).`,
      results,
      lossStreak,
    });
  } catch (err) {
    console.error('[API /fst/resolve]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
