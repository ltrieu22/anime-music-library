import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startBrowserHarness } from '../scripts/browser-harness.mjs';

const savedKey = 'anime_songs_db_v1';
const notesKey = 'anime_song_notes_v1';
const playlistsKey = 'anime-db:playlists';
const catalog = JSON.parse(readFileSync('public/data/anime_catalog.json', 'utf8'));
const intended = catalog.find(song => song.id === 'song-34831');
const songs = [
  { id: 1, source_song_id: intended.id, anime_name: intended.anime_name, anime_year: 2021, artist: intended.artist, song_name: 'Edited saved title' },
  { id: 2, source_song_id: 'missing-catalog-song', anime_name: intended.anime_name, anime_year: 2021, artist: intended.artist, song_name: intended.song_name },
  { id: 3, anime_name: intended.anime_name, anime_year: 2021, artist: intended.artist, song_name: 'Manual song without media' },
];
const { browser, base, close } = await startBrowserHarness();
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const errors = [];
  await context.route('**/*', route => {
    const url = route.request().url();
    if (!url.startsWith(base)) return route.abort();
    if (url.includes('/api/anime/search')) return route.fulfill({ json: { results: [{
      id: 'fixture', name: 'Lookup fixture', year: 2021,
      themes: [{ type: 'OP', title: 'Lookup theme', artist: 'Fixture artist' }],
    }] } });
    return route.continue();
  });
  await context.addInitScript(({ songs, savedKey, notesKey, playlistsKey }) => {
    if (!localStorage.getItem('reliability-test-seeded')) {
      localStorage.setItem(savedKey, JSON.stringify(songs));
      localStorage.setItem(notesKey, JSON.stringify({ version: 1, notes: {
        'catalog:song-34831': { songKey: 'catalog:song-34831', text: 'Keep my note', updatedAt: '2026-10-21T00:00:00Z',
          song: { ...songs[0], id: 'song-34831', source: 'anisongdb' } },
      } }));
      localStorage.setItem(playlistsKey, JSON.stringify({ version: 1, playlists: [{ id: 'keep-list', name: 'Keep playlist', songs: [] }] }));
      localStorage.setItem('reliability-test-seeded', 'true');
    }
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === window.blockedStorageKey) throw new DOMException('Storage full', 'QuotaExceededError');
      return write.call(this, key, value);
    };
  }, { songs, savedKey, notesKey, playlistsKey });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const button = name => page.getByRole('button', { name, exact: true });
  const stored = () => page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [savedKey, notesKey, playlistsKey]);
  const block = key => page.evaluate(key => { window.blockedStorageKey = key; }, key);
  const savedSongs = async () => {
    await page.getByRole('button', { name: /^My Collection/ }).first().click();
    await page.getByRole('button', { name: /^Saved Songs/ }).click();
  };
  const focusWraps = async dialog => {
    assert.equal(await dialog.evaluate(el => el.matches(':modal')), true, 'background is inert');
    const controls = dialog.locator('button:visible:enabled, input:visible:enabled, select:visible:enabled, textarea:visible:enabled, a[href]:visible');
    await controls.last().focus();
    await page.keyboard.press('Tab');
    assert.equal(await controls.first().evaluate(el => el === document.activeElement), true, 'Tab wraps inside dialog');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await controls.last().evaluate(el => el === document.activeElement), true, 'Shift+Tab wraps inside dialog');
  };
  await page.goto(`${base}/anime_db/`);
  await savedSongs();
  const row = page.locator('tbody tr').filter({ hasText: 'Edited saved title' });
  await row.locator('button[title="Play in bottom player"]').click();
  await page.waitForFunction(url => document.querySelector('video')?.getAttribute('src') === url, intended.video_url || intended.audio_url);
  for (const title of [intended.song_name, 'Manual song without media']) {
    const unavailable = page.locator('tbody tr').filter({ hasText: title });
    assert.equal(await unavailable.getByText('Media unavailable', { exact: true }).count(), 1);
    assert.equal(await unavailable.locator('button[title="Play in bottom player"]').count(), 0);
    await unavailable.getByRole('button', { name: 'More song actions' }).click();
    assert.equal(await page.getByRole('menuitem', { name: 'Add to queue', exact: true }).isDisabled(), true);
    await page.keyboard.press('Escape');
  }

  // A failed add retains its draft and the persisted library; retry commits once.
  const original = await stored();
  await button('Add Song').click();
  let dialog = page.getByRole('dialog', { name: 'Add Anime Song' });
  await dialog.waitFor();
  assert.equal(await dialog.getByRole('textbox', { name: 'Search anime titles' }).evaluate(el => el === document.activeElement), true);
  await focusWraps(dialog);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await button('Add Song').evaluate(el => el === document.activeElement), true);
  await button('Add Song').click();
  await dialog.getByRole('button', { name: 'Manual Entry' }).click();
  await dialog.getByLabel('Anime Name').fill('Retry anime');
  await dialog.getByLabel('Artist Name').fill('Retry artist');
  await dialog.getByLabel('Song Name / Theme Title').fill('Retry song');
  await block(savedKey);
  await dialog.getByRole('button', { name: 'Save Song', exact: true }).click();
  await dialog.getByRole('alert').filter({ hasText: 'Could not save Saved Songs' }).waitFor();
  assert.deepEqual(await stored(), original);
  assert.equal(await dialog.getByLabel('Anime Name').inputValue(), 'Retry anime');
  await block(null);
  await dialog.getByRole('button', { name: 'Save Song', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(JSON.parse((await stored())[0]).length, 4);

  // Failed API-theme adds are visible and remain retryable too.
  await button('Add Song').click();
  await dialog.getByRole('button', { name: 'Fast API Theme Lookup' }).click();
  await dialog.getByRole('textbox', { name: 'Search anime titles' }).fill('Lookup');
  await dialog.getByRole('button', { name: 'Add', exact: true }).waitFor();
  await block(savedKey);
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await dialog.getByRole('alert').filter({ hasText: 'Could not save Saved Songs' }).waitFor();
  assert.equal(JSON.parse((await stored())[0]).length, 4);
  await block(null);
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await dialog.getByRole('button', { name: 'Added', exact: true }).waitFor();
  assert.equal(JSON.parse((await stored())[0]).length, 5);
  await page.keyboard.press('Escape');

  const editTrigger = row.getByRole('button', { name: 'More song actions' });
  await editTrigger.click();
  await page.getByRole('menuitem', { name: 'Edit song', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Edit Song Entry #1' });
  await dialog.waitFor();
  assert.equal(await dialog.getByLabel('Anime Name').evaluate(el => el === document.activeElement), true);
  await focusWraps(dialog);
  await dialog.getByLabel('Song Name', { exact: true }).fill('Retried edit');
  const beforeEdit = await stored();
  await block(savedKey);
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await dialog.getByRole('alert').filter({ hasText: 'Could not save Saved Songs' }).waitFor();
  assert.deepEqual(await stored(), beforeEdit);
  await block(null);
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(JSON.parse((await stored())[0])[0].song_name, 'Retried edit');
  assert.equal(await page.locator('tbody tr').first().getByRole('button', { name: 'More song actions' }).evaluate(el => el === document.activeElement), true);

  // Reset commits songs and notes together; either write failure preserves both.
  await button('Manage data').click();
  dialog = page.getByRole('dialog', { name: 'Manage Song Database' });
  await dialog.waitFor();
  await focusWraps(dialog);
  await dialog.getByRole('button', { name: 'Reset...', exact: true }).click();
  const beforeReset = await stored();
  for (const key of [savedKey, notesKey]) {
    await block(key);
    await dialog.getByRole('button', { name: 'Reset & Delete', exact: true }).click();
    await dialog.getByRole('alert').filter({ hasText: 'Reset failed' }).waitFor();
    assert.deepEqual(await stored(), beforeReset, `reset rolls back when ${key} fails`);
    assert.equal(await page.locator('video').getAttribute('src'), intended.video_url || intended.audio_url, 'failed reset keeps the player');
  }
  await block(null);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await button('Manage data').evaluate(el => el === document.activeElement), true);

  // All three modal layouts and their keyboard behavior at narrow widths.
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 568 });
    for (const kind of ['add', 'edit', 'data']) {
      if (kind === 'add') await button('Add Song').click();
      else if (kind === 'data') await button('Manage data').click();
      else {
        const trigger = page.locator('.mobile-song-cards').getByRole('button', { name: 'More song actions' }).first();
        await trigger.scrollIntoViewIfNeeded();
        // Let scrolling settle before opening a menu that intentionally closes on scroll.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await trigger.click();
        await page.getByRole('menuitem', { name: 'Edit song', exact: true }).press('Enter');
      }
      dialog = page.getByRole('dialog');
      await dialog.waitFor();
      if (kind === 'add') await dialog.getByRole('button', { name: 'Manual Entry' }).click();
      if (kind === 'data') await dialog.getByRole('button', { name: 'Reset...', exact: true }).click();
      await focusWraps(dialog);
      const bounds = await dialog.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= 569, `${kind} fits ${width}px viewport`);
      assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, `${kind} has no horizontal overflow at ${width}px`);
      if (width === 390) await page.screenshot({ path: join(tmpdir(), `collection-${kind}-dialog-390.png`) });
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await button('Manage data').click();
  dialog = page.getByRole('dialog', { name: 'Manage Song Database' });
  await dialog.getByRole('button', { name: 'Reset...', exact: true }).click();
  await dialog.getByRole('button', { name: 'Reset & Delete', exact: true }).click();
  await dialog.getByRole('status').filter({ hasText: 'Database restored' }).waitFor();
  const afterReset = await stored();
  assert.deepEqual(JSON.parse(afterReset[0]), []);
  assert.deepEqual(JSON.parse(afterReset[1]).notes, {});
  assert.equal(afterReset[2], beforeReset[2], 'custom playlists survive reset');
  assert.equal(await page.locator('video').getAttribute('src'), null);
  assert.deepEqual(errors, []);
  await context.close();
  console.log('PASS: failed add/edit/reset and retry, reset rollback, exact-ID media recovery, unavailable tracks, native dialog semantics/focus/Escape, and 320/390px dialog layouts.');
} finally { await close(); }
