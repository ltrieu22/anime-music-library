import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startBrowserHarness } from '../scripts/browser-harness.mjs';

const { browser, base, close } = await startBrowserHarness();
try {
  for (const failedFile of ['catalog.compact.json', 'artist_aliases.json']) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    const requested = [];
    page.on('pageerror', error => errors.push(error.message));
    let failing = true;
    let attempts = 0;
    await page.route('**/*', route => {
      const url = route.request().url();
      requested.push(url);
      if (!url.startsWith(base)) return route.abort();
      if (url.endsWith(failedFile)) {
        attempts++;
        if (failing) return route.fulfill({ status: 503, body: 'Temporarily unavailable' });
      }
      return route.continue();
    });
    await page.goto(`${base}/anime_db/`);
    await page.getByRole('heading', { name: 'Catalog unavailable' }).waitFor();
    if (failedFile === 'catalog.compact.json') {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: join(tmpdir(), 'catalog-recovery-mobile.png'), fullPage: true });
      await page.setViewportSize({ width: 1280, height: 900 });
    }
    assert.equal(await page.getByRole('navigation', { name: 'Catalog result pages' }).count(), 0);
    assert.equal(await page.getByText('No results', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByRole('heading', { name: 'Catalog unavailable' }).waitFor();
    failing = false;
    await page.getByRole('button', { name: 'Retry', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 100);
    assert.equal(attempts, 3);
    assert.equal(await page.getByRole('heading', { name: 'Catalog unavailable' }).count(), 0);
    assert.ok(requested.filter(url => url.includes('/data/')).every(url => url.includes('/anime_db/data/')));
    assert.ok(!requested.some(url => /(?:AddSongModal|DataModal|NoteModal|EditSongModal|PlaylistSongPicker)-/.test(url)), 'dialogs are absent from initial requests');
    const search = page.getByPlaceholder('Search anime, artist, song title, or your notes... (Press / to focus)');
    await search.fill('Heike');
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 2);
    await search.fill('no-matching-song-xyz');
    await page.getByText('No results', { exact: true }).first().waitFor();
    assert.equal(await page.getByRole('button', { name: 'Retry', exact: true }).count(), 0);
    await search.fill('Heike');
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 2);
    await page.getByRole('button', { name: 'Manage data', exact: true }).click();
    await page.getByRole('button', { name: 'Close data manager' }).waitFor();
    assert.ok(requested.some(url => /DataModal-/.test(url)));
    await page.getByRole('button', { name: 'Close data manager' }).click();
    await page.getByRole('button', { name: 'More song actions', exact: true }).first().click();
    await page.getByRole('menuitem', { name: /note/i }).click();
    await page.getByRole('dialog').waitFor();
    assert.ok(await page.locator('textarea').evaluate(el => el === document.activeElement));
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.ok(await page.getByRole('button', { name: 'More song actions', exact: true }).first().evaluate(el => el === document.activeElement));
    await page.getByRole('button', { name: 'More song actions', exact: true }).first().click();
    await page.getByRole('menuitem', { name: 'Add to playlist', exact: true }).click();
    await page.getByRole('dialog', { name: 'Add to playlist' }).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.deepEqual(errors, []);
    console.log(`PASS: ${failedFile} repeated failure, keyboard Retry, full results, search/no matches, subpath, lazy dialogs and focus restoration`);
    await context.close();
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  await page.goto(`${base}/anime_db/?play=song-34830&q=no-matching-song-xyz`);
  const catalog = JSON.parse(readFileSync('public/data/anime_catalog.json', 'utf8'));
  const song = catalog.find(song => song.id === 'song-34830');
  await page.waitForFunction(url => document.querySelector('video')?.getAttribute('src') === url, song.video_url || song.audio_url);
  const video = page.locator('video');
  const source = await video.getAttribute('src');
  await page.getByPlaceholder('Search anime, artist, song title, or your notes... (Press / to focus)').fill('Heike');
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 2);
  assert.equal(await video.getAttribute('src'), source);
  await page.getByRole('button', { name: 'Close Player', exact: true }).click();
  await page.getByRole('button', { name: 'Add Song', exact: true }).click();
  await page.getByRole('button', { name: 'Manual Entry' }).click();
  await page.getByPlaceholder('e.g., Call of the Night').fill('Local browser test');
  await page.getByPlaceholder('e.g., Creepy Nuts').fill('Test artist');
  await page.getByPlaceholder('e.g., Daten (OP)').fill('Test song');
  await page.getByRole('button', { name: 'Save Song', exact: true }).click();
  await page.getByRole('button', { name: /My Collection/ }).click();
  await page.getByRole('button', { name: /Saved Songs/ }).click();
  await page.locator('tbody tr').first().waitFor();
  await page.getByRole('button', { name: 'More song actions', exact: true }).first().click();
  await page.getByRole('menuitem', { name: 'Edit song', exact: true }).click();
  await page.getByRole('button', { name: 'Save Changes', exact: true }).waitFor();
  console.log('PASS: exact-ID production media resolution despite filters, search preserves media, lazy Add and Edit dialogs');
  await context.close();
} finally { await close(); }
