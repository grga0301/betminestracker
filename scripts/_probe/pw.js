const { chromium } = require('playwright');
(async () => {
  for (const headless of [true, false]) {
    const b = await chromium.launch({ headless, args: ['--disable-blink-features=AutomationControlled'] });
    const ctx = await b.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', locale: 'en-US' });
    const p = await ctx.newPage();
    try {
      const r = await p.goto('https://www.forebet.com/en/football-tips-and-predictions-for-today', { waitUntil: 'domcontentloaded', timeout: 45000 });
      await p.waitForTimeout(8000);
      const html = await p.content();
      console.log(`PLAYWRIGHT headless=${headless} status=${r.status()} rows=${(html.match(/rcnt tr_/g) || []).length} title=${await p.title()}`);
    } catch (e) { console.log(`PLAYWRIGHT headless=${headless} ERR ${e.message}`); }
    await b.close();
  }
})();
