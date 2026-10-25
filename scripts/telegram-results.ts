// scripts/telegram-results.ts — npm run telegram:results -- collect|prompt
//
// Manual result entry through the Telegram group, so no tip stays PENDING forever:
//   prompt  — asks (once a day) for the final score of every tip the automatic resolvers could not settle.
//   collect — reads replies to those questions ("2-1"), settles the tip and confirms.
// The bot only sees replies to its own messages (Telegram privacy mode), which is exactly what we need.
// Each question carries a tag: #B<selectionId> BetMines, #F FST, #T FreeTips, #E<id> ext tip, #L<id>.<leg> ext leg.
import { prisma } from '../src/lib/db/prisma';
import { sendTelegramMessage, sourceLabel } from '../src/lib/services/telegramService';
import { withLossStreakAlert } from '../src/lib/services/streakAlertService';
import { evaluateStrict } from '../src/lib/services/geminiEvaluator';
import { evaluateSelection, evaluateDouble } from '../src/lib/services/resultEvaluator';
import { evaluateExtMarket } from '../src/lib/services/extTipEvaluator';
import type { ExtLeg } from '../src/lib/scraper/tiporacle';

const TG = 'https://api.telegram.org';
const MAX_PROMPTS_PER_RUN = 10;
const PROMPT_WINDOW_DAYS = 30;
const LEG_DONE_AFTER_MS = 5 * 3600 * 1000;

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dayOffset = (days: number) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);

async function tg(method: string, params: Record<string, string | number> = {}): Promise<any> {
  const res = await fetch(`${TG}/bot${token}/${method}?${new URLSearchParams(params as Record<string, string>)}`);
  return res.json();
}

// ── Applying a score ─────────────────────────────────────────────────────────

/** Returns a confirmation line, or null when the market could not be settled from a score. */
async function applyScore(tag: string, id: number, leg: number | null, hs: number, as: number): Promise<string | null> {
  const score = `${hs}-${as}`;
  switch (tag) {
    case 'B': {
      const sel = await prisma.betSelection.findUnique({ where: { id } });
      if (!sel) return null;
      const status = evaluateSelection({ market: sel.market, line: sel.line, homeScore: hs, awayScore: as });
      if (status !== 'WIN' && status !== 'LOSS') return null;
      await prisma.betSelection.update({ where: { id }, data: { homeScore: hs, awayScore: as, resultStatus: status } });
      const all = await prisma.betSelection.findMany({ where: { doubleId: sel.doubleId } });
      const doubleStatus = evaluateDouble(all.map((s) => s.resultStatus as any));
      await prisma.betDouble.update({ where: { id: sel.doubleId }, data: { status: doubleStatus } });
      return `${sel.homeTeam} – ${sel.awayTeam} ${score} → ${status} (double: ${doubleStatus})`;
    }
    case 'F':
    case 'T': {
      const model: any = tag === 'F' ? prisma.fstTip : prisma.ftTip;
      const tip = await model.findUnique({ where: { id } });
      if (!tip) return null;
      const status = await evaluateStrict(tip.market, tip.homeTeam, tip.awayTeam, hs, as, null, tip.pick);
      if (!status) return null;
      await model.update({ where: { id }, data: { status, homeScore: hs, awayScore: as } });
      return `${tip.homeTeam} – ${tip.awayTeam} ${score} → ${status}`;
    }
    case 'E': {
      const tip = await prisma.extTip.findUnique({ where: { id } });
      if (!tip) return null;
      const status = evaluateExtMarket(tip.market, hs, as, tip.homeTeam, tip.awayTeam);
      if (!status) return null;
      await prisma.extTip.update({ where: { id }, data: { status, homeScore: hs, awayScore: as } });
      return `${tip.homeTeam} – ${tip.awayTeam} ${score} → ${status}`;
    }
    case 'L': {
      const tip = await prisma.extTip.findUnique({ where: { id } });
      if (!tip?.legs || leg === null) return null;
      const legs = JSON.parse(tip.legs) as ExtLeg[];
      const l = legs[leg];
      if (!l) return null;
      const status = evaluateExtMarket(l.market, hs, as, l.homeTeam, l.awayTeam);
      if (!status) return null;
      legs[leg] = { ...l, status, homeScore: hs, awayScore: as };
      const ticket = legs.some((x) => x.status === 'LOSS') ? 'LOSS' : legs.every((x) => x.status === 'WIN') ? 'WIN' : 'PENDING';
      await prisma.extTip.update({ where: { id }, data: { status: ticket, legs: JSON.stringify(legs) } });
      return `${l.homeTeam} – ${l.awayTeam} ${score} → ${status} (tiket: ${ticket})`;
    }
  }
  return null;
}

// ── collect: read replies ────────────────────────────────────────────────────

async function collect() {
  const data = await tg('getUpdates', { allowed_updates: JSON.stringify(['message']) });
  const updates: any[] = data.result ?? [];
  console.log(`Telegram updates: ${updates.length}`);
  if (updates.length === 0) return;

  for (const u of updates) {
    const m = u.message;
    if (!m || String(m.chat?.id) !== String(chatId)) continue;
    const quoted: string = m.reply_to_message?.text ?? '';
    const tagMatch = quoted.match(/#([BFTEL])(\d+)(?:\.(\d+))?/);
    const scoreMatch = (m.text ?? '').match(/^\s*(\d{1,2})\s*[-:–]\s*(\d{1,2})\s*$/);
    if (!m.reply_to_message?.from?.is_bot || !tagMatch || !scoreMatch) continue;

    const [, tag, id, leg] = tagMatch;
    const hs = parseInt(scoreMatch[1], 10);
    const as = parseInt(scoreMatch[2], 10);
    console.log(`Reply for #${tag}${id}${leg ? '.' + leg : ''}: ${hs}-${as}`);
    try {
      const done = await applyScore(tag, parseInt(id, 10), leg !== undefined ? parseInt(leg, 10) : null, hs, as);
      await sendTelegramMessage(
        done ? `✅ Spremljeno: ${esc(done)}` : `⚠️ Ne mogu odrediti ishod iz rezultata ${hs}-${as} (#${tag}${id}). Provjeri tržište.`
      );
    } catch (e) {
      console.error('Failed to apply reply:', e);
    }
  }

  // Confirm all processed updates so they are not read again.
  const lastId = Math.max(...updates.map((u) => u.update_id));
  await tg('getUpdates', { offset: lastId + 1, limit: 1 });
}

// ── prompt: ask for unresolved scores ────────────────────────────────────────

interface Ask {
  sortKey: string;
  text: string;
}

async function prompt() {
  const to = dayOffset(-1); // anything dated yesterday or earlier has been played
  const from = dayOffset(-PROMPT_WINDOW_DAYS);
  const asks: Ask[] = [];
  const line = (src: string, home: string, away: string, date: string, what: string, tag: string) =>
    `❓ <b>${esc(src)}</b> · ${esc(date)}\n${esc(home)} – ${esc(away)}\nTip: ${esc(what)}\n\nOdgovori na ovu poruku konačnim rezultatom (npr. <b>2-1</b>)\n${tag}`;

  const sels = await prisma.betSelection.findMany({
    where: { resultStatus: 'PENDING', double: { date: { gte: from, lte: to } } },
    include: { double: true },
  });
  for (const s of sels) {
    asks.push({ sortKey: s.double.date, text: line(sourceLabel('BETMINES'), s.homeTeam, s.awayTeam, s.double.date, `${s.market} @ ${s.odd}`, `#B${s.id}`) });
  }

  for (const [src, tag, model] of [['FST', 'F', prisma.fstTip], ['FT', 'T', prisma.ftTip]] as const) {
    const tips: any[] = await (model as any).findMany({ where: { status: 'PENDING', date: { gte: from, lte: to } } });
    for (const t of tips) {
      asks.push({ sortKey: t.date, text: line(sourceLabel(src), t.homeTeam, t.awayTeam, t.date, `${t.pick} @ ${t.odd}`, `#${tag}${t.id}`) });
    }
  }

  const ext = await prisma.extTip.findMany({ where: { status: 'PENDING', date: { gte: from, lte: to } } });
  for (const t of ext) {
    if (!t.legs) {
      asks.push({ sortKey: t.date, text: line(sourceLabel(t.source), t.homeTeam, t.awayTeam, t.date, `${t.pick || t.market} @ ${t.odd}`, `#E${t.id}`) });
      continue;
    }
    (JSON.parse(t.legs) as ExtLeg[]).forEach((l, i) => {
      if (l.status === 'PENDING' && Date.parse(l.kickoffIso) + LEG_DONE_AFTER_MS < Date.now()) {
        asks.push({ sortKey: t.date, text: line(sourceLabel(t.source) + ' (tiket)', l.homeTeam, l.awayTeam, t.date, l.market, `#L${t.id}.${i}`) });
      }
    });
  }

  asks.sort((a, b) => b.sortKey.localeCompare(a.sortKey)); // newest first
  console.log(`Unresolved: ${asks.length}, asking for ${Math.min(asks.length, MAX_PROMPTS_PER_RUN)}`);
  for (const a of asks.slice(0, MAX_PROMPTS_PER_RUN)) {
    await sendTelegramMessage(a.text);
    await sleep(1500);
  }
  if (asks.length > MAX_PROMPTS_PER_RUN) {
    await sendTelegramMessage(`ℹ️ Još ${asks.length - MAX_PROMPTS_PER_RUN} tipova čeka rezultat; pitam sutra.`);
  }
}

async function main() {
  const mode = process.argv[2];
  if (!token || !chatId) {
    console.log('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set — nothing to do.');
    return;
  }
  if (mode === 'collect') await withLossStreakAlert(collect);
  else if (mode === 'prompt') await prompt();
  else {
    console.error('Usage: tsx scripts/telegram-results.ts collect|prompt');
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('✗ telegram-results failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
