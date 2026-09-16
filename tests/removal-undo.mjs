import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startBrowserHarness } from '../scripts/browser-harness.mjs';

const { browser, base, close } = await startBrowserHarness();
const wav = Buffer.alloc(44 + 8000 * 2 * 120);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.clock.install();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    if (route.request().url().startsWith(`${base}/test-media/`)) {
      const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range || '');
      const start = range ? Number(range[1]) : 0;
      const end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
      return route.fulfill({ status: range ? 206 : 200, contentType: 'audio/wav', body: wav.subarray(start, end + 1),
        headers: { 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${wav.length}` } : {}) } });
    }
    return route.request().url().startsWith(base) ? route.continue() : route.abort();
  });
  await page.addInitScript(({ base }) => {
    if (localStorage.getItem('undo-seeded')) return;
    const songs = [4, 9, 18].map(id => ({ id, local_song_id: `manual-${id}`, anime_name: 'Undo anime',
      anime_year: 2024, song_name: `Undo song ${id}`, artist: 'Test artist', audio_url: `${base}/test-media/${id}.wav` }));
    localStorage.setItem('anime_songs_db_v1', JSON.stringify(songs));
    localStorage.setItem('anime_song_notes_v1', JSON.stringify({ version: 1, notes: {
      'collection:9': { songKey: 'collection:9', text: 'Keep this note', updatedAt: '2026-09-17T00:00:00Z', song: songs[1] },
    } }));
    const refs = songs.map(song => ({ songId: song.local_song_id, source: 'local', snapshot: song }));
    localStorage.setItem('anime-db:playlists', JSON.stringify({ version: 1, playlists: [
      { id: 'first', name: 'First playlist', songs: refs }, { id: 'other', name: 'Other playlist', songs: refs },
    ] }));
    localStorage.setItem('undo-seeded', 'true');
  }, { base });
  await page.goto(`${base}/anime_db/`);
  const button = name => page.getByRole('button', { name, exact: true });
  const library = page.locator('section[aria-labelledby="collection-library-heading"]');
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('anime_songs_db_v1')));
  const lists = () => page.evaluate(() => JSON.parse(localStorage.getItem('anime-db:playlists')).playlists);
  const failWrites = key => page.evaluate(key => {
    window.originalSetItem ??= Storage.prototype.setItem;
    Storage.prototype.setItem = function(k, v) {
      if (k === key) throw new DOMException('Quota', 'QuotaExceededError');
      return window.originalSetItem.call(this, k, v);
    };
  }, key);
  const allowWrites = () => page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
  await page.getByRole('button', { name: /^My Collection/ }).click();
  await library.getByRole('button', { name: /^Saved Songs/ }).click();
  const initial = await saved(), initialLists = await lists();
  const initialNotes = await page.evaluate(() => localStorage.getItem('anime_song_notes_v1'));
  await button('Remove from saved songs').nth(1).click();
  await button('Undo').waitFor();
  assert.equal(await button('Undo').evaluate(el => getComputedStyle(el).cursor), 'pointer');
  assert.equal(await button('Dismiss').evaluate(el => getComputedStyle(el).cursor), 'pointer');
  assert.deepEqual((await saved()).map(song => song.id), [4, 18]);
  await failWrites('anime_songs_db_v1');
  await button('Undo').click();
  await page.getByRole('alert').filter({ hasText: 'Could not save Saved Songs' }).waitFor();
  assert.deepEqual((await saved()).map(song => song.id), [4, 18]);
  await allowWrites();
  await button('Retry Undo').focus();
  await page.keyboard.press('Enter');
  assert.deepEqual(await saved(), initial);
  assert.deepEqual(await lists(), initialLists);
  // A failed removal offers no Undo and leaves the row in place.
  await failWrites('anime_songs_db_v1');
  await button('Remove from saved songs').nth(1).click();
  assert.deepEqual(await saved(), initial);
  assert.equal(await button('Undo').count(), 0);
  await allowWrites();
  await button('Remove from saved songs').nth(1).click();
  await button('Undo').waitFor();
  await button('Undo').focus();
  await page.clock.fastForward(13000);
  assert.ok(await button('Undo').isVisible(), 'Focus pauses expiration');
  await button('Undo').click();
  assert.deepEqual(await saved(), initial);
  await library.getByRole('button', { name: 'My Collection', exact: true }).click();
  await library.getByRole('button', { name: /^First playlist/ }).click();
  await button('Play Playlist').click();
  const media = page.locator('video').first();
  await page.waitForFunction(() => [...document.querySelectorAll('video')].some(el => !el.paused && el.readyState >= 2));
  await media.evaluate(el => { el.currentTime = 25; });
  await page.waitForFunction(() => { const el = document.querySelector('video'); return el && !el.seeking && el.currentTime >= 25; });
  const playingSource = await media.evaluate(el => el.currentSrc);
  await button('More song actions').nth(1).click();
  await page.getByRole('menuitem', { name: 'Remove from playlist', exact: true }).click();
  await button('Cancel').click();
  assert.deepEqual(await lists(), initialLists);
  await button('More song actions').nth(1).click();
  await page.getByRole('menuitem', { name: 'Remove from playlist', exact: true }).click();
  await button('Remove song').click();
  await button('Undo').waitFor();
  assert.equal((await lists())[0].songs.length, 2);
  await button('Undo').click();
  assert.deepEqual(await lists(), initialLists);
  // Whole playlist deletion and bulk deletion retain exact IDs and memberships.
  await button('Delete playlist').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete playlist', exact: true }).click();
  await button('Undo').waitFor();
  assert.equal((await lists()).length, 1);
  await failWrites('anime-db:playlists');
  await button('Undo').click();
  await button('Retry Undo').waitFor();
  assert.equal((await lists()).length, 1);
  await allowWrites();
  await button('Retry Undo').click();
  assert.deepEqual(await lists(), initialLists);
  await button('Manage playlists').click();
  await button('Select all').click();
  await button('Delete selected (2)').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete selected (2)', exact: true }).click();
  await button('Undo').waitFor();
  assert.deepEqual(await lists(), []);
  await button('Undo').click();
  assert.deepEqual(await lists(), initialLists);
  await button('Done').click();
  await library.getByRole('button', { name: /^First playlist/ }).click();
  assert.ok(await media.evaluate(el => !el.paused && el.currentTime >= 25));
  assert.equal(await media.evaluate(el => el.currentSrc), playingSource);
  // Picker removal exposes the same keyboard-accessible action inside the modal.
  await button('More song actions').nth(1).click();
  await page.getByRole('menuitem', { name: 'Add to playlist', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add to playlist', exact: true });
  await dialog.getByRole('button', { name: 'First playlist 3 songs Added', exact: true }).click();
  await failWrites('anime-db:playlists');
  await dialog.getByRole('button', { name: 'Undo', exact: true }).click();
  await dialog.getByRole('alert').filter({ hasText: 'Could not save playlists' }).waitFor();
  await allowWrites();
  await dialog.getByRole('button', { name: 'Retry Undo', exact: true }).click();
  assert.deepEqual(await lists(), initialLists);
  await dialog.getByRole('button', { name: 'First playlist 3 songs Added', exact: true }).click();
  await button('Close playlist picker').click();
  await button('Undo').waitFor();
  await page.screenshot({ path: join(tmpdir(), 'removal-undo-desktop.png') });
  await button('Undo').click();
  assert.deepEqual(await lists(), initialLists);
  // Queue Undo preserves exact occurrences, repeat mode and uninterrupted audio.
  const session = () => page.evaluate(() => JSON.parse(localStorage.getItem('anime-db:player-session-v1')));
  await button('Show queue').click();
  const panel = page.locator('#playback-queue');
  await panel.getByRole('button', { name: 'Repeat all', exact: true }).click();
  const originalQueue = await session();
  await panel.getByRole('button', { name: /^Remove upcoming song 1,/ }).focus();
  await page.keyboard.press('Enter');
  await button('Undo').waitFor();
  await page.screenshot({ path: join(tmpdir(), 'queue-removal-undo.png') });
  assert.equal((await session()).items.length, 2);
  await failWrites('anime-db:player-session-v1');
  await button('Undo').click();
  await button('Retry Undo').waitFor();
  assert.equal((await session()).items.length, 2);
  await allowWrites();
  await button('Retry Undo').click();
  assert.deepEqual((await session()).items, originalQueue.items);
  assert.equal((await session()).repeatMode, 'all');
  assert.ok(await media.evaluate(el => !el.paused && el.currentTime >= 25));
  await button('Clear upcoming').click();
  await button('Undo').waitFor();
  assert.equal((await session()).items.length, 1);
  await button('Undo').click();
  assert.deepEqual((await session()).items, originalQueue.items);
  await panel.getByRole('button', { name: /^Remove current song/ }).focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('video')?.currentSrc.includes('/9.wav'));
  const successor = await media.evaluate(el => el.currentSrc);
  await button('Undo').click();
  assert.equal(await media.evaluate(el => el.currentSrc), successor);
  assert.deepEqual((await session()).items.map(item => item.queueItemId), [originalQueue.items[1].queueItemId, originalQueue.items[0].queueItemId, originalQueue.items[2].queueItemId]);
  await button('Clear upcoming').click();
  await button('Dismiss').click();
  await media.evaluate(el => { el.currentTime = 31; });
  await page.waitForFunction(() => { const el = document.querySelector('video'); return el && !el.seeking && el.currentTime >= 31; });
  await panel.getByRole('button', { name: /^Remove current song/ }).focus();
  await page.keyboard.press('Enter');
  await button('Undo').waitFor();
  assert.equal(await session(), null);
  await button('Undo').click();
  await page.waitForFunction(() => { const el = document.querySelector('video'); return el && el.paused && el.currentTime >= 31; });
  assert.equal((await session()).items[0].queueItemId, originalQueue.items[1].queueItemId);
  assert.equal((await session()).repeatMode, 'all');
  if (await button('Close queue').isVisible()) await button('Close queue').click();
  // An unengaged action expires and removal remains persisted after reload.
  await button('More song actions').nth(1).click();
  await page.getByRole('menuitem', { name: 'Remove from playlist', exact: true }).click();
  await button('Remove song').click();
  await button('Undo').waitFor();
  await page.mouse.move(0, 0);
  await page.clock.fastForward(4000);
  assert.ok(await button('Undo').isVisible());
  await page.clock.fastForward(1250);
  assert.equal(await button('Undo').count(), 0);
  await page.reload();
  assert.equal((await lists())[0].songs.length, 2);
  assert.deepEqual(await saved(), initial);
  assert.deepEqual((await lists())[1], initialLists[1]);
  assert.equal(await page.evaluate(() => localStorage.getItem('anime_song_notes_v1')), initialNotes);
  assert.deepEqual(errors, []);
  console.log('PASS: saved songs, playlist membership/single/bulk deletion and queue/current/clear Undo; exact identity/order, retry, keyboard access, pointer cursor, five-second expiry, notes, playback and paused tail restoration');
  await context.close();
} finally { await close(); }
