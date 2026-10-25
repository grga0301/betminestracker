// src/lib/services/unresolvedService.ts
// Final fallback: a tip whose result no source could find within UNRESOLVED_AFTER_DAYS stops being PENDING and
// becomes UNRESOLVED. It is excluded from statistics and streaks (like VOID) but is never counted as a LOSS,
// so missing data cannot distort the numbers. If a result turns up later it can still be entered manually.

import { prisma } from '../db/prisma';
import { evaluateDouble } from './resultEvaluator';

export const UNRESOLVED_AFTER_DAYS = 7;

/** Marks PENDING tips/selections older than the cutoff as UNRESOLVED. Returns how many rows changed. */
export async function giveUpOldPending(days = UNRESOLVED_AFTER_DAYS): Promise<number> {
  const cutoff = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  let total = 0;
  try {
    const where = { status: 'PENDING', date: { lt: cutoff } };
    const fst = await prisma.fstTip.updateMany({ where, data: { status: 'UNRESOLVED' } });
    const ft = await prisma.ftTip.updateMany({ where, data: { status: 'UNRESOLVED' } });
    const ext = await prisma.extTip.updateMany({ where, data: { status: 'UNRESOLVED' } });
    total += fst.count + ft.count + ext.count;

    // BetMines: stale pending selections, then re-evaluate their doubles (a LOSS still wins over UNRESOLVED).
    const sels = await prisma.betSelection.findMany({
      where: { resultStatus: 'PENDING', double: { date: { lt: cutoff } } },
      select: { id: true, doubleId: true },
    });
    if (sels.length > 0) {
      await prisma.betSelection.updateMany({ where: { id: { in: sels.map((s) => s.id) } }, data: { resultStatus: 'UNRESOLVED' } });
      total += sels.length;
      for (const doubleId of new Set(sels.map((s) => s.doubleId))) {
        const all = await prisma.betSelection.findMany({ where: { doubleId }, select: { resultStatus: true } });
        const status = evaluateDouble(all.map((s) => s.resultStatus as any));
        await prisma.betDouble.update({ where: { id: doubleId }, data: { status } });
      }
    }
    if (total > 0) console.log(`[Unresolved] ${total} item(s) older than ${days} days had no result — marked UNRESOLVED`);
  } catch (e) {
    console.warn('[Unresolved] could not apply fallback:', e instanceof Error ? e.message : e);
  }
  return total;
}
