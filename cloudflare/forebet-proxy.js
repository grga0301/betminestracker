// Cloudflare Worker: fetches www.forebet.com from Cloudflare's network (GitHub's IPs get blocked).
// Protected by a shared token so it cannot be used as an open proxy.
// Deploy: Workers & Pages → Create → Hello World → paste this → Deploy, then add the secret PROXY_TOKEN.

export default {
  async fetch(request, env) {
    if (!env.PROXY_TOKEN || request.headers.get('x-proxy-token') !== env.PROXY_TOKEN) {
      return new Response('forbidden', { status: 403 });
    }

    let target;
    try {
      target = new URL(new URL(request.url).searchParams.get('url'));
    } catch {
      return new Response('bad url', { status: 400 });
    }
    if (target.hostname !== 'www.forebet.com') {
      return new Response('host not allowed', { status: 400 });
    }

    const upstream = await fetch(target.toString(), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  },
};
