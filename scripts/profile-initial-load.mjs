// Run after npm run build. Uses a fresh, isolated browser context for each run.
// Set PLAYWRIGHT_MODULE to an installed Playwright module when it is not local.
import { startBrowserHarness } from './browser-harness.mjs';
const { browser, base, close } = await startBrowserHarness();
try {
  for (let run = 0; run < 5; run++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    await page.addInitScript(() => {
      window.catalogProfile = { json: [] };
      const original = window.fetch;
      window.fetch = async (...args) => {
        const response = await original(...args);
        if (String(args[0]).includes('/data/')) {
          const json = response.json.bind(response);
          response.json = async () => {
            const start = performance.now();
            const value = await json();
            window.catalogProfile.json.push({ url: String(args[0]), bodyAndParseMs: performance.now() - start });
            return value;
          };
        }
        return response;
      };
      new MutationObserver(() => {
        if (!window.catalogProfile.rowsMs && document.querySelectorAll('tbody tr').length >= 100) {
          window.catalogProfile.rowsMs = performance.now();
        }
      }).observe(document, { childList: true, subtree: true });
    });
    await page.goto(`${base}/anime_db/`);
    await page.waitForFunction(() => window.catalogProfile.rowsMs);
    console.log(JSON.stringify(await page.evaluate(() => ({
      ...window.catalogProfile,
      resources: performance.getEntriesByType('resource').filter(r => /\/data\/|\.js$/.test(r.name)).map(r => ({
        file: r.name.split('/').at(-1), ms: r.duration, bytes: r.decodedBodySize,
      })),
    }))));
    await context.close();
  }
} finally { await close(); }
