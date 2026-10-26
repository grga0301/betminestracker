// src/lib/services/telegramService.ts

const TELEGRAM_API = 'https://api.telegram.org';

export async function sendTelegramMessage(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping notification.');
    return;
  }

  const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[Telegram] Failed to send message:', err);
  } else {
    console.log('[Telegram] Notification sent.');
  }
}

// ── Notifications ────────────────────────────────────────────────────────────
// Every helper swallows its own errors: a failed Telegram call must never break a scrape or resolve run.

const SOURCE_LABELS: Record<string, string> = {
  BETMINES: 'BetMines Double',
  FST: 'FreeSuperTips',
  FT: 'FreeTips',
  TIPORACLE: 'TipOracle',
  FOOTYACCA: 'FootyAccumulators',
  FOOTYACCA_BTTS: 'FootyAcca BTTS',
  FOOTYACCA_OVER25: 'FootyAcca Over 2.5',
  FOOTBALLPARK: 'FootballPark',
  FOOTBALLSUPER: 'FootballSuper',
  FREETIPS_DOUBLE: 'FreeTips Daily Double',
  BETMINES_RISK: 'BetMines Risk',
  ZULUBET: 'Zulubet',
};

export function sourceLabel(key: string): string {
  return SOURCE_LABELS[key] ?? key;
}

function esc(s: string | number | null | undefined): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface NotifyTip {
  homeTeam: string;
  awayTeam: string;
  market: string;
  odd?: number | null;
  kickoff?: string | null;
}

/** "New tip(s) published" message for one source. */
export async function notifyNewTips(source: string, date: string, tips: NotifyTip[], totalOdds?: number): Promise<void> {
  if (tips.length === 0) return;
  try {
    const lines = tips.map(
      (t) =>
        `• <b>${esc(t.homeTeam)} – ${esc(t.awayTeam)}</b>\n   ${esc(t.market)}` +
        `${t.odd ? ` @ ${t.odd}` : ''}${t.kickoff ? ` · ${esc(t.kickoff)}` : ''}`
    );
    const total = totalOdds ? `\nUkupni koeficijent: <b>×${totalOdds.toFixed(2)}</b>` : '';
    await sendTelegramMessage(`🆕 <b>${esc(sourceLabel(source))}</b> · ${esc(date)}\n${lines.join('\n')}${total}`);
  } catch (e) {
    console.warn('[Telegram] notifyNewTips failed:', e);
  }
}

/** "Tip settled" message: WIN / LOSS with the score. */
export async function notifyResult(
  source: string,
  tip: NotifyTip & { date?: string },
  status: string,
  score?: { homeScore: number | null; awayScore: number | null } | null
): Promise<void> {
  if (status !== 'WIN' && status !== 'LOSS') return;
  try {
    const icon = status === 'WIN' ? '🟢' : '🔴';
    const result = score && score.homeScore !== null && score.awayScore !== null ? ` (${score.homeScore}-${score.awayScore})` : '';
    await sendTelegramMessage(
      `${icon} <b>${esc(sourceLabel(source))}</b> · ${status}\n` +
        `${esc(tip.homeTeam)} – ${esc(tip.awayTeam)}${result}\n${esc(tip.market)}${tip.odd ? ` @ ${tip.odd}` : ''}`
    );
  } catch (e) {
    console.warn('[Telegram] notifyResult failed:', e);
  }
}
