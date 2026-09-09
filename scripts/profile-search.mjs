// Run after building. Set PLAYWRIGHT_MODULE when Playwright is installed elsewhere.
import { startBrowserHarness } from './browser-harness.mjs';
const { browser, base, close } = await startBrowserHarness();
try {
  for (let run = 0; run < 3; run++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    await page.addInitScript(() => {
      window.searchTasks = [];
      new PerformanceObserver(list => window.searchTasks.push(...list.getEntries().map(e => ({ start: e.startTime, duration: e.duration }))))
        .observe({ type: 'longtask', buffered: true });
    });
    await page.goto(`${base}/anime_db/`);
    const ready = () => page.waitForFunction(() => /Results/.test(document.querySelector('nav[aria-label="Catalog result pages"]')?.textContent || ''));
    await ready();
    for (const query of ['h', 'he', 'Heike', 'IKE', 'Gundam', '']) {
      const start = await page.evaluate(() => performance.now());
      await page.locator('#search-input').fill(query);
      await ready();
      console.log(JSON.stringify(await page.evaluate(({ start, query, run }) => {
        const tasks = window.searchTasks.filter(t => t.start >= start);
        return { run, query, elapsedMs: performance.now() - start, longestTaskMs: Math.max(0, ...tasks.map(t => t.duration)), blockingMs: tasks.reduce((sum, t) => sum + t.duration - 50, 0) };
      }, { start, query, run })));
    }
    for (const name of ['Openings', 'Endings', 'All Themes']) {
      const start = await page.evaluate(() => performance.now());
      await page.getByRole('button', { name, exact: true }).click();
      await ready();
      console.log(JSON.stringify(await page.evaluate(({ start, name, run }) => {
        const tasks = window.searchTasks.filter(t => t.start >= start);
        return { run, filter: name, elapsedMs: performance.now() - start, longestTaskMs: Math.max(0, ...tasks.map(t => t.duration)), blockingMs: tasks.reduce((sum, t) => sum + t.duration - 50, 0) };
      }, { start, name, run })));
    }
    await context.close();
  }
} finally { await close(); }
