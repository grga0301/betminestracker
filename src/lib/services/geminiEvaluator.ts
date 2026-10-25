// Evaluates bet outcomes using Google Gemini Flash (free tier)
// Handles complex combined markets like "Away Win & BTTS", "Home Win & Over 2.5", etc.

import { evaluateSelection } from './resultEvaluator';
import { evaluateExtMarket } from './extTipEvaluator';

// Pinned model ids get retired (gemini-2.0-flash now returns 404), so default to the rolling alias.
// Flash-Lite has the most generous free tier; accuracy is enough for "final score of X vs Y".
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-flash-lite-latest';

// Free-tier quota guard: at most N grounded searches per process, and stop for good after the first 429.
const MAX_SEARCHES_PER_RUN = Number(process.env.GEMINI_MAX_SEARCHES ?? 10);
let searches = 0;
let quotaHit = false;

export async function evaluateWithGemini(
  market: string,
  pick: string,
  homeTeam: string,
  awayTeam: string,
  homeScore: number,
  awayScore: number
): Promise<'WIN' | 'LOSS' | 'VOID' | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const prompt =
    `Football match result: ${homeTeam} ${homeScore}-${awayScore} ${awayTeam}\n\n` +
    `Bet details:\n` +
    `- Market: ${market}\n` +
    `- Pick: ${pick}\n\n` +
    `Did this bet win? ALL conditions in the pick must be satisfied.\n` +
    `Reply with exactly one word: WIN, LOSS, or VOID (only if the market is genuinely void/cancelled).`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 256 },
      }),
    }
  ).catch((e) => {
    console.log(`  [Gemini] network error: ${e?.cause?.code ?? e}`);
    return null;
  });

  if (!res || !res.ok) {
    if (res) console.log(`  [Gemini] API error: ${res.status}`);
    return null; // API failure ≠ a void bet — let the caller keep the tip pending
  }

  const json = await res.json();
  const answer = (json.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim().toUpperCase();

  if (answer.startsWith('WIN')) return 'WIN';
  if (answer.startsWith('LOSS')) return 'LOSS';
  if (answer.startsWith('VOID')) return 'VOID';
  return null; // unclear answer — don't guess
}

// ── Gemini web-search fallback for scores ────────────────────────────────────
// Last resort when every API/scraper source fails. An LLM can hallucinate a score, so a result is accepted
// only when TWO independent votes (different prompt wording and model) return the same score, both say the
// match is finished, and both were backed by real Google Search results. Anything else stays PENDING.
// Accepted scores are written to the LlmScore table (with source URLs) so they can be reviewed.

const VOTE_MODELS = (process.env.GEMINI_VOTE_MODELS ?? `${GEMINI_MODEL},gemini-flash-latest`).split(',').map((m) => m.trim());

interface Vote {
  homeScore: number;
  awayScore: number;
  urls: string[];
}

async function askGemini(model: string, prompt: string): Promise<Vote | 'UNKNOWN' | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ googleSearch: {} }],
          generationConfig: { temperature: 0, maxOutputTokens: 400 },
        }),
      }
    );
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
      console.log(`  [Gemini] ${model}: HTTP ${res.status} ${body}`);
      if (res.status === 429) quotaHit = true;
      return null;
    }
    const json = await res.json();
    const cand = json.candidates?.[0];
    const answer: string = (cand?.content?.parts ?? []).map((p: any) => p.text ?? '').join('').trim();
    console.log(`  [Gemini] ${model}: ${answer.replace(/\s+/g, ' ').slice(0, 200)}`);

    const urls: string[] = (cand?.groundingMetadata?.groundingChunks ?? [])
      .map((c: any) => c.web?.uri)
      .filter((u: unknown): u is string => typeof u === 'string');
    const finished = /FINISHED:\s*yes/i.test(answer);
    const m = answer.match(/SCORE:\s*(\d{1,2})\s*[-–]\s*(\d{1,2})/i);
    if (/SCORE:\s*UNKNOWN/i.test(answer)) return 'UNKNOWN';
    if (!m || !finished) return 'UNKNOWN';
    if (urls.length === 0) {
      console.log(`  [Gemini] ${model}: answer without any search source — ignored`);
      return 'UNKNOWN';
    }
    return { homeScore: parseInt(m[1], 10), awayScore: parseInt(m[2], 10), urls };
  } catch (e) {
    console.log(`  [Gemini] ${model}: exception ${e}`);
    return null;
  }
}

export async function fetchScoreWithGemini(
  homeTeam: string,
  awayTeam: string,
  date: string,
): Promise<{ homeScore: number; awayScore: number } | null> {
  if (!process.env.GEMINI_API_KEY || quotaHit) return null;
  // Never ask about matches that may still be running or only just ended.
  const today = new Date().toISOString().slice(0, 10);
  if (date >= today) return null;
  if (searches + 2 > MAX_SEARCHES_PER_RUN) return null;

  const ask = (i: number) =>
    i === 0
      ? `Use Google Search. What was the final score of the football match ${homeTeam} (home) vs ${awayTeam} (away), played on ${date} (the date may be off by one day)?
` +
        `Score = goals after 90 minutes plus extra time, NOT counting a penalty shootout. Give the home team's goals first.
` +
        `Reply in exactly this format:
SCORE: H-A
FINISHED: yes or no
SOURCE: the page you used
` +
        `If you cannot find this exact match with certainty, reply only: SCORE: UNKNOWN`
      : `Search the web for the result of ${homeTeam} against ${awayTeam} on or around ${date}. ${homeTeam} is the HOME side.
` +
        `I need the full-time result (including extra time, excluding penalties). Do not guess and do not use a different season or a different pairing of clubs.
` +
        `Answer strictly as:
SCORE: <home goals>-<away goals>
FINISHED: yes/no
SOURCE: <url>
` +
        `or, if unsure, just: SCORE: UNKNOWN`;

  searches++;
  const first = await askGemini(VOTE_MODELS[0], ask(0));
  if (!first || first === 'UNKNOWN') return null; // nothing found (or API trouble) — no second call needed
  searches++;
  const second = await askGemini(VOTE_MODELS[1] ?? VOTE_MODELS[0], ask(1));
  if (!second || second === 'UNKNOWN') return null;

  if (first.homeScore !== second.homeScore || first.awayScore !== second.awayScore) {
    console.log(`  [Gemini] votes disagree (${first.homeScore}-${first.awayScore} vs ${second.homeScore}-${second.awayScore}) — keeping PENDING`);
    return null;
  }
  if (first.homeScore > 15 || first.awayScore > 15) return null; // implausible

  try {
    const { prisma } = await import('../db/prisma');
    await prisma.llmScore.create({
      data: {
        homeTeam,
        awayTeam,
        date,
        homeScore: first.homeScore,
        awayScore: first.awayScore,
        sources: JSON.stringify([...new Set([...first.urls, ...second.urls])].slice(0, 6)),
        models: JSON.stringify([VOTE_MODELS[0], VOTE_MODELS[1] ?? VOTE_MODELS[0]]),
      },
    });
  } catch (e) {
    console.log(`  [Gemini] could not write audit row: ${e instanceof Error ? e.message : e}`);
  }
  console.log(`  [Gemini] 2/2 votes agree: ${first.homeScore}-${first.awayScore}`);
  return { homeScore: first.homeScore, awayScore: first.awayScore };
}

// Tries local rule-based evaluation first; falls back to Gemini only for unknown markets.
// pick defaults to market when not available as a separate field (e.g. BetMines).
export async function evaluateWithFallback(
  market: string,
  homeTeam: string,
  awayTeam: string,
  homeScore: number,
  awayScore: number,
  line: number | null = null,
  pick?: string,
): Promise<'WIN' | 'LOSS' | 'VOID'> {
  const local = evaluateSelection({ market, line, homeScore, awayScore });
  if (local === 'WIN' || local === 'LOSS') return local;
  if (local !== 'VOID') return 'VOID';

  if (!process.env.GEMINI_API_KEY) return 'VOID';

  console.log(`  🤖 Unknown market "${market}" — falling back to Gemini...`);
  return (await evaluateWithGemini(market, pick ?? market, homeTeam, awayTeam, homeScore, awayScore)) ?? 'VOID';
}

/**
 * Like evaluateWithFallback, but returns null when the bet cannot be settled with confidence
 * (unknown market, push, Gemini unavailable) so the caller keeps it PENDING instead of storing VOID.
 * Tries, in order: the legacy rules, the wider pick/market vocabulary (handicaps, "to win to nil" …), Gemini.
 */
export async function evaluateStrict(
  market: string,
  homeTeam: string,
  awayTeam: string,
  homeScore: number,
  awayScore: number,
  line: number | null = null,
  pick?: string,
): Promise<'WIN' | 'LOSS' | null> {
  const local = evaluateSelection({ market, line, homeScore, awayScore });
  if (local === 'WIN' || local === 'LOSS') return local;

  for (const text of [pick, market]) {
    if (!text) continue;
    const ext = evaluateExtMarket(text, homeScore, awayScore, homeTeam, awayTeam);
    if (ext) return ext;
  }

  if (!process.env.GEMINI_API_KEY) return null;
  console.log(`  🤖 Unknown market "${market}" / pick "${pick ?? ''}" — asking Gemini...`);
  const g = await evaluateWithGemini(market, pick ?? market, homeTeam, awayTeam, homeScore, awayScore);
  return g === 'WIN' || g === 'LOSS' ? g : null;
}
