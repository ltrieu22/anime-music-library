import assert from 'node:assert/strict';
import { startBrowserHarness } from '../scripts/browser-harness.mjs';

// All provider responses are fulfilled locally. Nothing reaches AniList/Kitsu.
const { browser, base, close } = await startBrowserHarness();
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  let calls = 0;
  let limited = false;
  await context.route('**/*', route => {
    const url = route.request().url();
    if (new URL(url).origin === base) return route.continue();
    if (url === 'https://graphql.anilist.co/') {
      calls++;
      if (limited) return route.fulfill({ status: 429, contentType: 'application/json',
        headers: { 'Retry-After': '120' }, body: JSON.stringify({ errors: [{ status: 429 }] }) });
      const id = route.request().postDataJSON().variables.id;
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: { Media: {
        id, title: { english: 'Fixture anime' }, coverImage: { large: `${base}/fixture-cover.svg` }, genres: ['Music'],
      } } }) });
    }
    return route.abort();
  });
  const page = await context.newPage();
  const title = () => page.locator('tbody a[title="View on AniList"]').first();
  const openCatalog = async () => {
    await page.goto(`${base}/anime_db/`);
    await title().waitFor();
    await page.mouse.move(0, 0);
  };
  const settle = ms => new Promise(resolve => setTimeout(resolve, ms));
  await openCatalog();
  await title().hover();
  await settle(100);
  await page.mouse.move(0, 0);
  await settle(450);
  assert.equal(calls, 0, 'brief hovers do not query AniList');
  await title().hover();
  await page.waitForFunction(() => localStorage.getItem('anime_details_v1')?.includes('fixture-cover.svg'));
  assert.equal(calls, 1);
  await openCatalog();
  await title().hover();
  await settle(600);
  assert.equal(calls, 1, 'full details survive reloading the real app');

  // Remove only fixture details; preserve the real persisted request pacing.
  await page.evaluate(() => localStorage.removeItem('anime_details_v1'));
  limited = true;
  await openCatalog();
  await title().hover();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('anilist_request_pacing_v1') || '{}').cooldownUntil > Date.now());
  assert.equal(calls, 2);
  await openCatalog();
  await title().hover();
  await settle(600);
  assert.equal(calls, 2, 'reload does not bypass an AniList cooldown');

  // Another tab shares the persisted cooldown as well.
  const second = await context.newPage();
  await second.goto(`${base}/anime_db/`);
  await second.locator('tbody a[title="View on AniList"]').first().hover();
  await settle(600);
  assert.equal(calls, 2, 'a second tab does not bypass the cooldown');
  await context.close();
  console.log('PASS: brief hovers, persistent details, rate-limit cooldown across reloads and tabs; all provider responses mocked');
} finally { await close(); }
