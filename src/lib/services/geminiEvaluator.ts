// Evaluates bet outcomes using Google Gemini Flash (free tier)
// Handles complex combined markets like "Away Win & BTTS", "Home Win & Over 2.5", etc.

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

  if (!res.ok) throw new Error(`Gemini API error: ${res.status} ${await res.text()}`);

  const json = await res.json();
  const answer = (json.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim().toUpperCase();

  if (answer.startsWith('WIN')) return 'WIN';
  if (answer.startsWith('LOSS')) return 'LOSS';
  return 'VOID';
}
