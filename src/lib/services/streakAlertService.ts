// src/lib/services/streakAlertService.ts
// Telegram alert when a tipster's losing streak reaches TELEGRAM_STREAK tickets (and on every further loss).

import { getDashboard } from './dashboardService';
import { sendTelegramMessage } from './telegramService';

/** Notify when a source has lost this many tickets in a row. */
export const TELEGRAM_STREAK = 4;

type Streaks = Record<string, number>;

/** Current losing streak (in tickets) per source key; 0 when the source is not on a losing run. */
async function lossStreaks(): Promise<{ streaks: Streaks; labels: Record<string, string> }> {
  const streaks: Streaks = {};
  const labels: Record<string, string> = {};
  for (const s of await getDashboard()) {
    streaks[s.key] = s.currentStreak.type === 'LOSS' ? s.currentStreak.tickets : 0;
    labels[s.key] = s.label;
  }
  return { streaks, labels };
}

/**
 * Runs `fn` (a resolve script) and, afterwards, sends one Telegram message per source whose losing streak
 * is now >= TELEGRAM_STREAK and longer than before the run. Comparing before/after makes the alert
 * stateless: hourly runs that change nothing never repeat it.
 * Never throws — a failed alert must not fail the resolve run.
 */
export async function withLossStreakAlert(fn: () => Promise<void>): Promise<void> {
  let before: Streaks = {};
  try {
    before = (await lossStreaks()).streaks;
  } catch (e) {
    console.warn('[Streak] could not read streaks before run:', e instanceof Error ? e.message : e);
  }

  await fn();

  try {
    const { streaks, labels } = await lossStreaks();
    for (const [key, n] of Object.entries(streaks)) {
      if (n >= TELEGRAM_STREAK && n > (before[key] ?? 0)) {
        console.log(`[Streak] ${labels[key]}: ${n} losses in a row — sending Telegram alert`);
        await sendTelegramMessage(
          `🚨 <b>${labels[key]}</b>\n❌ ${n} ${n < 5 ? 'tipa' : 'tipova'} zaredom pogrešno\n🔗 betminestracker.vercel.app/dashboard`
        );
      }
    }
  } catch (e) {
    console.warn('[Streak] alert check failed:', e instanceof Error ? e.message : e);
  }
}
