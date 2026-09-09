import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startBrowserHarness } from '../scripts/browser-harness.mjs';

// Real production UI and media, with isolated browser storage and local WAV audio.
const wav = Buffer.alloc(44 + 8000 * 2 * 120);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
const { browser, base, close } = await startBrowserHarness();
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    if (route.request().url().includes('/test-media/')) return route.fulfill({ contentType: 'audio/wav', body: wav });
    return route.request().url().startsWith(base) ? route.continue() : route.abort();
  });
  await page.addInitScript(({ base }) => {
    if (localStorage.getItem('management-test-seeded')) return;
    const songs = [1, 2].map(id => ({ id, local_song_id: `manual-${id}`, anime_name: 'Test anime',
      anime_year: 2024, song_name: `Test song ${id}`, artist: 'Test artist', audio_url: `${base}/test-media/${id}.wav` }));
    const refs = songs.map(song => ({ songId: song.local_song_id, source: 'local', snapshot: song }));
    localStorage.setItem('anime_songs_db_v1', JSON.stringify(songs));
    localStorage.setItem('anime_song_notes_v1', JSON.stringify({ version: 1, notes: {
      'collection:1': { songKey: 'collection:1', text: 'Keep my personal note', updatedAt: '2026-09-09T00:00:00Z', song: songs[0] },
    } }));
    localStorage.setItem('anime-db:playlists', JSON.stringify({ version: 1, playlists: [
      { id: 'playing', name: 'Playing playlist', songs: refs },
      { id: 'empty', name: 'Empty playlist', songs: [] },
      { id: 'keep', name: 'A long playlist name for anime openings and ending songs that stays', songs: refs },
    ] }));
    localStorage.setItem('management-test-seeded', 'true');
  }, { base });
  await page.goto(`${base}/anime_db/`);
  const button = name => page.getByRole('button', { name, exact: true });
  await page.getByRole('button', { name: /^My Collection/ }).click();
  const library = page.locator('section[aria-labelledby="collection-library-heading"]');
  const stored = () => page.evaluate(() => ({
    lists: JSON.parse(localStorage.getItem('anime-db:playlists')).playlists,
    saved: localStorage.getItem('anime_songs_db_v1'), notes: localStorage.getItem('anime_song_notes_v1'),
  }));
  const before = await stored();
  await library.getByRole('button', { name: /^Playing playlist/ }).click();
  await button('Play Playlist').click();
  const media = page.locator('video').first();
  await page.waitForFunction(() => [...document.querySelectorAll('video')].some(el => !el.paused && el.readyState >= 2));
  await media.evaluate(el => { el.currentTime = 30; });
  await library.getByRole('button', { name: 'My Collection', exact: true }).click();
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const bounds = () => library.locator(':scope > .grid > *').evaluateAll(cards => cards.map(card => {
      const measure = el => {
        const rect = el.getBoundingClientRect();
        return { x: rect.x, y: rect.y + window.scrollY, width: rect.width, height: rect.height };
      };
      return {
        card: measure(card),
        icon: measure(card.querySelector('svg')),
        title: measure(card.querySelector('h2, :scope > span.block')),
        description: measure(card.querySelector('p, :scope > span:last-child')),
      };
    }));
    const initialBounds = await bounds();
    await button('Manage playlists').click();
    assert.deepEqual(await bounds(), initialBounds, `Playlist cards, icons, and text must stay in place at ${width}px`);
    assert.ok(await library.evaluate(el => el.scrollWidth <= el.clientWidth));
    await button('Done').click();
    assert.deepEqual(await bounds(), initialBounds);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await button('Manage playlists').click();
  assert.ok(await button('Done').evaluate(el => el === document.activeElement));
  assert.equal(await library.getByRole('checkbox').count(), 3);
  assert.ok(await library.getByRole('button', { name: /^Saved Songs/ }).isDisabled());
  assert.ok(await button('Delete selected (0)').isDisabled());
  await button('Select all').click();
  await library.getByText('3 selected', { exact: true }).waitFor();
  await library.getByLabel('Select Empty playlist', { exact: true }).uncheck();
  await library.getByText('2 selected', { exact: true }).waitFor();
  await button('Done').click();
  assert.equal(await library.getByRole('checkbox').count(), 0);
  assert.deepEqual(await stored(), before);
  await button('Manage playlists').click();
  await library.getByLabel('Select Playing playlist', { exact: true }).focus();
  await page.keyboard.press('Space');
  await library.getByLabel('Select Empty playlist', { exact: true }).check();
  const openDelete = () => button('Delete selected (2)').click();
  await openDelete();
  const dialog = page.getByRole('dialog', { name: 'Delete 2 playlists?', exact: true });
  await page.screenshot({ path: join(tmpdir(), 'playlist-management-confirmation.png') });
  assert.deepEqual(await dialog.locator('li').allTextContents(), ['Playing playlist', 'Empty playlist']);
  assert.ok(await dialog.getByRole('button', { name: 'Cancel', exact: true }).evaluate(el => el === document.activeElement));
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.ok(await button('Delete selected (2)').evaluate(el => el === document.activeElement));
  await openDelete();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.deepEqual(await stored(), before);
  await openDelete();
  await page.evaluate(() => {
    window.originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'anime-db:playlists') throw new DOMException('Quota', 'QuotaExceededError');
      return window.originalSetItem.call(this, key, value);
    };
  });
  await dialog.getByRole('button', { name: 'Delete selected (2)' }).click();
  await dialog.getByRole('alert').filter({ hasText: 'Could not save playlists' }).waitFor();
  assert.deepEqual(await stored(), before);
  assert.equal(await library.locator('input[type="checkbox"]:checked').count(), 2);
  await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.screenshot({ path: join(tmpdir(), 'playlist-management-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(tmpdir(), 'playlist-management-mobile.png') });
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 460 }]) {
    await page.setViewportSize(viewport);
    assert.ok(await library.evaluate(el => el.scrollWidth <= el.clientWidth));
    await openDelete();
    assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth));
    const confirm = dialog.getByRole('button', { name: 'Delete selected (2)' });
    await confirm.focus(); await page.keyboard.press('Tab');
    assert.ok(await dialog.getByRole('button', { name: 'Close playlist dialog' }).evaluate(el => el === document.activeElement));
    await page.keyboard.press('Escape');
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  // Compare the active media immediately before and after deleting its source list.
  const playback = await media.evaluate(el => ({ src: el.src, time: el.currentTime, paused: el.paused }));
  assert.equal(playback.paused, false);
  await openDelete();
  await dialog.getByRole('button', { name: 'Delete selected (2)' }).click();
  await dialog.waitFor({ state: 'hidden' });
  const after = await stored();
  assert.deepEqual(after, { ...before, lists: [before.lists[2]] });
  assert.ok(await media.evaluate((el, old) => el.src === old.src && !el.paused && el.currentTime >= old.time, playback));
  await button('Show queue').click();
  await page.getByRole('region', { name: 'Playback queue' }).getByText('Test song 2', { exact: true }).waitFor();
  await button('Close queue').click();
  await button('Next Track').click();
  await page.waitForFunction(() => [...document.querySelectorAll('video')].some(el => el.src.endsWith('/2.wav') && !el.paused));
  await button('Done').click();
  await page.reload();
  await page.getByRole('button', { name: /^My Collection/ }).click();
  assert.deepEqual(await stored(), after);
  await library.getByRole('button', { name: /^A long playlist name/ }).click();
  await button('Delete playlist').click();
  await page.getByRole('dialog', { name: 'Delete playlist?', exact: true }).getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.deepEqual(await stored(), after);
  await library.getByRole('button', { name: 'My Collection', exact: true }).click();
  await button('Manage playlists').click();
  await button('Select all').click();
  await button('Done').click();
  assert.deepEqual(await stored(), after);
  await button('Manage playlists').click();
  assert.ok(await button('Delete selected (0)').isDisabled());
  await button('Select all').click();
  await button('Delete selected (1)').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete selected (1)' }).click();
  await button('Done').click();
  assert.ok(await button('Manage playlists').isDisabled());
  assert.ok(await library.getByRole('button', { name: /^Saved Songs/ }).isEnabled());
  assert.deepEqual(await stored(), { ...before, lists: [] });
  assert.deepEqual(errors, []);
  console.log('PASS: bulk selection, keyboard/focus, names confirmation, Cancel/Escape/Done, Saved Songs protection, atomic failed-save retry, mobile overflow, persistence, empty library, and uninterrupted active-playlist media/queue advancement');
  await context.close();
} finally { await close(); }
