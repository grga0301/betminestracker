import { NextResponse } from 'next/server';

const GITHUB_OWNER = 'grga0301';
const GITHUB_REPO = 'betminestracker';

export async function POST() {
  const token = process.env.GITHUB_PAT;

  if (!token) {
    return NextResponse.json(
      { error: 'GitHub PAT not configured. Add GITHUB_PAT to Vercel environment variables.' },
      { status: 500 }
    );
  }

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/daily-resolve-ft.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `GitHub API error: ${text}` }, { status: 500 });
  }

  return NextResponse.json({
    message: 'FT resolve triggered via GitHub Actions. Refresh in ~2 minutes.',
    triggered: true,
  });
}
