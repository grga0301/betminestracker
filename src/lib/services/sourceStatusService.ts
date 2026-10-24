// src/lib/services/sourceStatusService.ts
// Tracks consecutive scrape failures per source and sends a Telegram alert on the 4th one in a row.

import { prisma } from '../db/prisma';
import { sendTelegramMessage, sourceLabel } from './telegramService';

/** Alert when a source has failed this many runs in a row. */
export const FAILURE_ALERT_THRESHOLD = 4;
/** After the first alert, remind again every this many further failures (avoids spam). */
const REMINDER_EVERY = 12;

/**
 * Records the outcome of one scrape run for a source. Never throws — a broken status table
 * (e.g. migration not applied yet) must not break scraping.
 */
export async function recordSourceRun(source: string, ok: boolean, error?: string): Promise<void> {
  try {
    const now = new Date();
    if (ok) {
      const prev = await prisma.sourceStatus.findUnique({ where: { source } });
      await prisma.sourceStatus.upsert({
        where: { source },
        create: { source, failures: 0, lastOkAt: now },
        update: { failures: 0, lastOkAt: now, lastError: null },
      });
      if (prev && prev.failures >= FAILURE_ALERT_THRESHOLD) {
        await sendTelegramMessage(`✅ <b>${sourceLabel(source)}</b> opet radi (bilo ${prev.failures} neuspjeha zaredom).`);
      }
      return;
    }

    const row = await prisma.sourceStatus.upsert({
      where: { source },
      create: { source, failures: 1, lastFailAt: now, lastError: error?.slice(0, 300) ?? null },
      update: { failures: { increment: 1 }, lastFailAt: now, lastError: error?.slice(0, 300) ?? null },
    });
    const n = row.failures;
    if (n === FAILURE_ALERT_THRESHOLD || (n > FAILURE_ALERT_THRESHOLD && (n - FAILURE_ALERT_THRESHOLD) % REMINDER_EVERY === 0)) {
      const last = row.lastOkAt ? row.lastOkAt.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'nikad';
      await sendTelegramMessage(
        `🚨 <b>${sourceLabel(source)}</b> nije dohvaćen ${n} puta zaredom.\n` +
          `Zadnji uspjeh: ${last}` +
          (error ? `\nZadnja greška: ${error.slice(0, 200).replace(/[<>&]/g, ' ')}` : '')
      );
    }
  } catch (e) {
    console.warn('[SourceStatus] could not record run:', e instanceof Error ? e.message : e);
  }
}
