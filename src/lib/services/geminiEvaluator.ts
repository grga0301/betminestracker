// Evaluates bet outcomes using Google Gemini Flash (free tier)
// Handles complex combined markets like "Away Win & BTTS", "Home Win & Over 2.5", etc.

import { evaluateSelection } from './resultEvaluator';

export async function evaluateWithGemini(
  market: string,
  pick: string,
  homeTeam: string,
  awayTeam: string,
  homeScore: number,
  awayScore: number
): Promise<'WIN' | 'LOSS' | 'VOID'> {
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
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 10 },
      }),
    }
  );

  if (!res.ok) {
    console.log(`  [Gemini] API error: ${res.status}`);
    return 'VOID';
  }

  const json = await res.json();
  const answer = (json.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim().toUpperCase();

  if (answer.startsWith('WIN')) return 'WIN';
  if (answer.startsWith('LOSS')) return 'LOSS';
  return 'VOID';
}

// Uses Gemini with Google Search grounding to find a match result when all other sources fail.
export async function fetchScoreWithGemini(
  homeTeam: string,
  awayTeam: string,
  date: string,
): Promise<{ homeScore: number; awayScore: number } | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const prompt =
    `What was the final score of the football match between ${homeTeam} (home) and ${awayTeam} (away) played on ${date}?\n` +
    `Reply with ONLY the score in format "H-A" (e.g. "2-1"). ` +
    `If the match is not finished or you cannot find the result, reply with "UNKNOWN".`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ googleSearch: {} }],
          generationConfig: { temperature: 0, maxOutputTokens: 20 },
        }),
      }
    );

    if (!res.ok) {
      console.log(`  [Gemini] HTTP error: ${res.status}`);
      return null;
    }
    const json = await res.json();
    const answer = (json.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
    console.log(`  [Gemini] Raw answer: "${answer}"`);

    const match = answer.match(/\b(\d+)\s*[-–]\s*(\d+)\b/);
    if (!match) return null;

    return { homeScore: parseInt(match[1]), awayScore: parseInt(match[2]) };
  } catch (e) {
    console.log(`  [Gemini] Exception: ${e}`);
    return null;
  }
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
  return evaluateWithGemini(market, pick ?? market, homeTeam, awayTeam, homeScore, awayScore);
}
