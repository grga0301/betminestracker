// One-off: deletes the bot's own messages in the Telegram group sent since CUTOFF_ISO (default: today 00:00 Zagreb).
// Telegram has no "list my messages" call, so: find the newest message id, binary-search the first id at or after
// the cutoff (via forwardMessage, which exposes the original date), then call deleteMessage on that id range.
// deleteMessage only succeeds for the bot's own messages (the bot is not an admin), which is exactly the scope we want.
const token = process.env.TELEGRAM_BOT_TOKEN;
const chat = process.env.TELEGRAM_CHAT_ID;
const cutoff = Math.floor(Date.parse(process.env.CUTOFF_ISO || '2026-10-24T22:00:00Z') / 1000);
const api = async (method, body) => {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const probe = await api('sendMessage', { chat_id: chat, text: '🧹 Čistim stare poruke…', disable_notification: true });
if (!probe.ok) throw new Error('probe failed: ' + JSON.stringify(probe));
const newest = probe.result.message_id;
console.log('Newest message id:', newest);

// Original send time of message `id`, or null if it does not exist / cannot be forwarded.
async function dateOf(id) {
  const r = await api('forwardMessage', { chat_id: chat, from_chat_id: chat, message_id: id, disable_notification: true });
  if (!r.ok) return null;
  await api('deleteMessage', { chat_id: chat, message_id: r.result.message_id });
  await sleep(3500); // group rate limit ~20 messages/minute
  return r.result.forward_date ?? r.result.date;
}
async function dateNear(id, hi) {
  for (let i = id; i <= Math.min(id + 6, hi); i++) {
    const d = await dateOf(i);
    if (d !== null) return { id: i, date: d };
  }
  return null;
}

// Smallest id (in [lo, newest]) whose message is at or after the cutoff.
let lo = Math.max(1, newest - 400);
let hi = newest;
while (lo < hi) {
  const mid = Math.floor((lo + hi) / 2);
  const probeRes = await dateNear(mid, hi);
  if (!probeRes || probeRes.date >= cutoff) hi = probeRes ? Math.min(mid, probeRes.id) : mid;
  else lo = probeRes.id + 1;
}
console.log('First message id since cutoff:', lo);

let deleted = 0;
for (let id = lo; id <= newest; id++) {
  const r = await api('deleteMessage', { chat_id: chat, message_id: id });
  if (r.ok) deleted++;
  await sleep(150);
}
console.log(`Deleted ${deleted} bot message(s) in id range ${lo}-${newest}.`);
