import { createServer } from 'vite';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  for (const fixture of ['song-sharing', 'catalog-url', 'player-queue', 'collection-order', 'catalog-worker']) {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('pageerror', error => console.error(error.message));
    await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    await page.goto(`${base}/tests/${fixture}.html`);
    await page.locator('#run').click();
    await page.waitForFunction(() => /^(PASS|FAIL)/.test(document.getElementById('result')?.textContent || ''), undefined, { timeout: 60_000 });
    const result = await page.locator('#result').textContent();
    if (!result.startsWith('PASS')) throw new Error(`${fixture}: ${result}\n${await page.locator('#root').innerText()}`);
    console.log(`${fixture}: ${result}`);
    await context.close();
  }
} finally { await browser?.close(); await server.close(); }
