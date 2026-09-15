import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startBrowserHarness } from '../scripts/browser-harness.mjs';

// Isolated browser, real local WAV playback, and no live metadata/media providers.
const sessionKey = 'anime-db:player-session-v1';
const historyKey = 'anime-db:recent-songs-v1';
const wav = Buffer.alloc(44 + 8000 * 2 * 120);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
const { browser, base, close } = await startBrowserHarness();
try {
  const context = await browser.newContext();
  await context.route('**/*', route => {
    if (route.request().url().startsWith(`${base}/test-media/`)) {
      if (route.request().url().endsWith('missing.wav')) return route.fulfill({ status: 404, body: '' });
      const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range || '');
      const start = range ? Number(range[1]) : 0;
      const end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
      return route.fulfill({ status: range ? 206 : 200, contentType: 'audio/wav', body: wav.subarray(start, end + 1),
        headers: { 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${wav.length}` } : {}) } });
    }
    return route.request().url().startsWith(base) ? route.continue() : route.abort();
  });
  await context.addInitScript(({ base, sessionKey, historyKey }) => {
    window.playCalls = 0;
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) { window.playCalls++; return play.apply(this, args); };
    window.failPlaybackWrites = false;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (window.failPlaybackWrites && [sessionKey, historyKey].includes(key)) throw new Error('QuotaExceededError');
      return setItem.call(this, key, value);
    };
    if (localStorage.getItem('restoration-test-seeded')) return;
    const songs = [1, 2].map(id => ({ id, local_song_id: `manual-${id}`, anime_name: 'A long anime title for checking the restored player and recent songs',
      anime_year: 2024, song_name: `Restored song ${id}`, artist: 'Artist', audio_url: `${base}/test-media/${id}.wav` }));
    const tracks = songs.map(song => ({ id: `collection:${song.id}`, animeTitle: song.anime_name, songName: song.song_name,
      artist: song.artist, videoUrl: song.audio_url, actionSong: song }));
    localStorage.setItem('anime_songs_db_v1', JSON.stringify(songs));
    localStorage.setItem('anime_song_notes_v1', JSON.stringify({ version: 1, notes: {} }));
    localStorage.setItem(sessionKey, JSON.stringify({ version: 1, items: [tracks[0], tracks[1], tracks[0]].map((track, index) => ({ queueItemId: `queue:${index + 1}`, track })),
      index: 1, source: 'collection', repeatMode: 'all', position: 37.25 }));
    localStorage.setItem('restoration-test-seeded', 'true');
  }, { base, sessionKey, historyKey });
  let page = await context.newPage();
  const errors = [];
  const watch = () => page.on('pageerror', error => errors.push(error.message));
  watch();
  const button = name => page.getByRole('button', { name, exact: true });
  const bar = () => page.locator('#spotify-music-player');
  const media = () => page.locator('video').first();
  const stored = key => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  const waitAt = (suffix, position, paused = true) => page.waitForFunction(({ suffix, position, paused }) => {
    const el = document.querySelector('video');
    return el?.currentSrc.endsWith(suffix) && el.readyState >= 2 && !el.seeking && el.paused === paused && Math.abs(el.currentTime - position) < 1;
  }, { suffix, position, paused });
  const recent = async () => {
    await page.getByRole('button', { name: /^My Collection/ }).first().click();
    await page.getByRole('button', { name: /^Recent songs/ }).click();
  };

  await page.goto(`${base}/anime_db/`);
  await waitAt('/2.wav', 37.25);
  assert.equal(await page.evaluate(() => window.playCalls), 0, 'restoration must never request play');
  assert.equal(await stored(historyKey), null, 'restoring metadata must not count as listening');
  assert.equal((await stored(sessionKey)).items.length, 3);
  assert.match(await bar().getByRole('button', { name: /^Repeat:/ }).getAttribute('aria-label'), /^Repeat: all/);
  await button('Show queue').click();
  assert.equal(await page.locator('#playback-queue [data-queue-item]').count(), 1);
  await button('Close queue').click();
  await button('Play').click();
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key) || '{}').items?.length === 1, historyKey);
  await button('Pause').click();
  await media().evaluate(el => { el.currentTime = 42.5; });
  await waitAt('/2.wav', 42.5);
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).position === 42.5, sessionKey);
  const queueBefore = await stored(sessionKey);
  const listenedAt = (await stored(historyKey)).items[0].playedAt;
  await page.close();
  page = await context.newPage(); watch();
  await page.goto(`${base}/anime_db/`);
  await waitAt('/2.wav', 42.5);
  assert.equal(await page.evaluate(() => window.playCalls), 0);
  assert.deepEqual((await stored(sessionKey)).items, queueBefore.items);
  assert.equal((await stored(historyKey)).items[0].playedAt, listenedAt);
  await recent();
  assert.equal(await page.locator('ol li').count(), 1);
  await button('Next Track').click();
  await waitAt('/1.wav', 0, false);
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).items.length === 2, historyKey);
  await button('Pause').click();
  await button('Play Restored song 2').click();
  await waitAt('/2.wav', 0, false);
  assert.equal((await stored(sessionKey)).items.length, 1, 'recent song click starts one track');
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).items[0].track.songName === 'Restored song 2', historyKey);
  assert.equal(await page.locator('ol li').count(), 2, 'replaying updates an existing recent song');
  await button('Pause').click();
  for (const [width, height] of [[2560, 900], [1280, 900], [1024, 768], [768, 800], [640, 700], [390, 460], [320, 568]]) {
    await page.setViewportSize({ width, height });
    await bar().scrollIntoViewIfNeeded();
    const layout = await bar().evaluate(el => {
      const buttons = [...el.querySelectorAll('button')].filter(button => button.getBoundingClientRect().width > 0);
      const rects = buttons.map(button => { const r = button.getBoundingClientRect(); return { name: button.getAttribute('aria-label') || button.title, x: r.x, y: r.y, right: r.right, bottom: r.bottom }; });
      return { overflow: el.scrollWidth > el.clientWidth, rects };
    });
    assert.equal(layout.overflow, false, `player overflow at ${width}`);
    for (const rect of layout.rects) assert.ok(rect.x >= 0 && rect.right <= width && rect.y >= 0 && rect.bottom <= height, `offscreen ${rect.name} at ${width}`);
    for (let i = 0; i < layout.rects.length; i++) for (let j = i + 1; j < layout.rects.length; j++) {
      const a = layout.rects[i], b = layout.rects[j];
      assert.ok(a.right <= b.x + 1 || b.right <= a.x + 1 || a.bottom <= b.y + 1 || b.bottom <= a.y + 1, `overlap ${a.name}/${b.name} at ${width}`);
    }
    const repeat = layout.rects.find(r => r.name.startsWith('Repeat:'));
    const next = layout.rects.find(r => r.name === 'Next Track');
    assert.ok(repeat.x - next.right < 12 && Math.abs(repeat.y - next.y) < 1, 'repeat must be directly beside Next');
    await page.screenshot({ path: join(tmpdir(), `anime-restoration-${width}.png`) });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  const queueAtClear = await stored(sessionKey);
  const unrelated = await page.evaluate(() => [localStorage.getItem('anime_songs_db_v1'), localStorage.getItem('anime_song_notes_v1')]);
  await button('Clear history').click();
  assert.ok(await button('Cancel').evaluate(el => el === document.activeElement));
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('ol li').count(), 2);
  assert.ok(await button('Clear history').evaluate(el => el === document.activeElement));
  await button('Clear history').click();
  await page.evaluate(() => { window.failPlaybackWrites = true; });
  await button('Clear recent songs').click();
  assert.match(await page.getByRole('dialog').innerText(), /Could not clear history/);
  assert.equal(await page.locator('ol li').count(), 2);
  await page.evaluate(() => { window.failPlaybackWrites = false; });
  await button('Clear recent songs').click();
  assert.equal((await stored(historyKey)).items.length, 0);
  assert.deepEqual(await stored(sessionKey), queueAtClear);
  assert.deepEqual(await page.evaluate(() => [localStorage.getItem('anime_songs_db_v1'), localStorage.getItem('anime_song_notes_v1')]), unrelated);
  await page.evaluate(() => { window.failPlaybackWrites = true; });
  await bar().getByRole('button', { name: /^Repeat:/ }).click();
  assert.match(await page.getByRole('alert').first().innerText(), /Could not save your queue/);
  await page.evaluate(() => { window.failPlaybackWrites = false; });
  await button('Retry saving playback').first().click();
  await page.getByRole('alert').first().waitFor({ state: 'detached' });
  assert.equal((await stored(sessionKey)).repeatMode, 'off');
  await button('Close Player').click();
  assert.equal(await stored(sessionKey), null);
  await page.reload();
  await page.waitForTimeout(350);
  assert.equal(await bar().count(), 0);
  assert.equal(await page.evaluate(() => window.playCalls), 0);
  await recent();
  assert.equal(await page.locator('ol li').count(), 0);

  // A known URL that has disappeared remains paused with a useful error and Next.
  await page.evaluate(({ sessionKey, base, queueBefore }) => {
    queueBefore.items[1].track.videoUrl = `${base}/test-media/missing.wav`;
    localStorage.setItem(sessionKey, JSON.stringify(queueBefore));
  }, { sessionKey, base, queueBefore });
  await page.reload();
  await page.getByRole('status').filter({ hasText: 'This media could not be loaded' }).waitFor();
  assert.equal(await page.evaluate(() => window.playCalls), 0);
  await button('Next Track').click();
  await waitAt('/1.wav', 0, false);
  await button('Pause').click();
  // A saved position beyond the media duration clamps safely without autoplay.
  await page.evaluate(key => { const saved = JSON.parse(localStorage.getItem(key)); saved.position = 9999; localStorage.setItem(key, JSON.stringify(saved)); }, sessionKey);
  await page.reload();
  await waitAt('/1.wav', 120);
  assert.equal(await page.evaluate(() => window.playCalls), 0);
  // Future/invalid payloads are left untouched; a new explicit listen recovers.
  await page.evaluate(({ sessionKey, historyKey }) => {
    localStorage.setItem(sessionKey, '{"version":99}'); localStorage.setItem(historyKey, 'invalid');
  }, { sessionKey, historyKey });
  await page.reload();
  await recent();
  assert.equal(await bar().count(), 0);
  assert.match(await page.locator('body').innerText(), /Recent songs could not be read/);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), sessionKey), '{"version":99}');
  assert.equal(await page.evaluate(key => localStorage.getItem(key), historyKey), 'invalid');
  await page.evaluate(({ sessionKey, historyKey, queueBefore }) => {
    localStorage.setItem(sessionKey, JSON.stringify(queueBefore));
    localStorage.setItem(historyKey, JSON.stringify({ version: 1, items: [] }));
  }, { sessionKey, historyKey, queueBefore });
  await page.reload();
  await waitAt('/2.wav', 42.5);
  await page.evaluate(() => { window.failPlaybackWrites = true; });
  await button('Play').click();
  await page.getByRole('alert').filter({ hasText: 'Could not save recent songs' }).first().waitFor();
  await button('Pause').click();
  await page.evaluate(() => { window.failPlaybackWrites = false; });
  await button('Retry saving playback').first().click();
  assert.equal((await stored(historyKey)).items.length, 1);
  await recent();
  const otherPage = await context.newPage();
  otherPage.on('pageerror', error => errors.push(error.message));
  await otherPage.goto(`${base}/anime_db/`);
  await otherPage.getByRole('button', { name: /^My Collection/ }).click();
  await otherPage.getByRole('button', { name: /^Recent songs/ }).click();
  await otherPage.getByRole('button', { name: 'Clear history', exact: true }).click();
  await otherPage.getByRole('button', { name: 'Clear recent songs', exact: true }).click();
  await page.locator('ol li').waitFor({ state: 'detached' });
  await button('Next Track').click();
  await waitAt('/1.wav', 0, false);
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).items.length === 1, historyKey);
  assert.equal((await stored(historyKey)).items[0].track.songName, 'Restored song 1', 'another tab must not resurrect cleared history');
  await otherPage.close();
  assert.deepEqual(errors, []);
  console.log('PASS: paused restoration after reload/reopening, position and duration clamp, repeat/duplicate identities, recent replay/deduplication, clear cancellation/failure/retry, session/history save retry, cross-tab history clearing, close persistence, missing media, older data and seven player layouts.');
} finally { await close(); }
