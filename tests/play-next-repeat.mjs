import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startBrowserHarness } from '../scripts/browser-harness.mjs';

// Production UI with actual local audio and isolated storage. No live providers.
const wav = Buffer.alloc(44 + 8000 * 2 * 120);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
const { browser, base, close } = await startBrowserHarness();
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
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
    if (localStorage.getItem('repeat-test-seeded')) return;
    localStorage.setItem('anime_songs_db_v1', JSON.stringify([1, 2, 3].map(id => ({
      id, local_song_id: `manual-${id}`, anime_name: 'An extremely long anime title to exercise the player layout',
      anime_year: 2024, song_name: `Test song ${id}`, artist: 'Test artist',
      ...(id === 3 ? {} : { audio_url: `${base}/test-media/${id}.wav` }),
    }))));
    localStorage.setItem('repeat-test-seeded', 'true');
  }, { base });
  await page.goto(`${base}/anime_db/`);
  const button = name => page.getByRole('button', { name, exact: true });
  const bar = page.locator('#spotify-music-player');
  const media = page.locator('video').first();
  const panel = page.locator('#playback-queue');
  const upcoming = panel.locator('[data-queue-item]');
  const playing = async suffix => page.waitForFunction(suffix => {
    const el = document.querySelector('video');
    return el && el.currentSrc.endsWith(suffix) && !el.paused && el.readyState >= 2;
  }, suffix);
  const songMenu = async (index, action) => {
    const trigger = page.getByRole('button', { name: 'More song actions', exact: true }).filter({ visible: true }).nth(index);
    await trigger.scrollIntoViewIfNeeded();
    // Song menus intentionally close on scroll; settle the scroll before opening.
    await page.waitForTimeout(150);
    await trigger.click();
    await page.getByRole('menuitem', { name: action, exact: true }).click();
    assert.ok(await trigger.evaluate(el => el === document.activeElement), 'song action must restore focus');
  };
  await page.getByRole('button', { name: /^My Collection/ }).click();
  await page.getByRole('button', { name: /^Saved Songs/ }).click();
  await songMenu(0, 'Play next');
  await playing('/1.wav');
  assert.equal(await bar.getByRole('button', { name: /^Repeat: off/ }).count(), 1);
  await media.evaluate(el => { el.currentTime = 30; window.sourceChanges = 0; el.addEventListener('loadstart', () => window.sourceChanges++); });
  await page.waitForFunction(() => { const el = document.querySelector('video'); return !el.seeking && el.currentTime >= 30; });
  await songMenu(1, 'Add to queue');
  await button('More player actions').click();
  await page.getByRole('menuitem', { name: 'Play next', exact: true }).click();
  assert.ok(await button('More player actions').evaluate(el => el === document.activeElement));
  await button('Show queue').click();
  assert.deepEqual(await upcoming.locator('p.font-semibold').allTextContents(), ['Test song 1', 'Test song 2']);
  const ids = await upcoming.evaluateAll(rows => rows.map(row => row.dataset.queueItem));
  assert.equal(new Set(ids).size, 2);
  await panel.getByRole('button', { name: 'Repeat one', exact: true }).focus();
  await page.keyboard.press('Space');
  assert.equal(await panel.getByRole('button', { name: 'Repeat one', exact: true }).getAttribute('aria-pressed'), 'true');
  const afterRepeat = await media.evaluate(el => ({ paused: el.paused, time: el.currentTime, src: el.currentSrc, duration: el.duration, error: el.error?.message }));
  assert.ok(!afterRepeat.paused && afterRepeat.time >= 30, JSON.stringify(afterRepeat));
  assert.equal(await page.evaluate(() => window.sourceChanges), 0);
  await button('Pause').click();
  const pausedTime = await media.evaluate(el => el.currentTime);
  await panel.getByRole('button', { name: 'Repeat all', exact: true }).click();
  await button('Close queue').click();
  await songMenu(1, 'Play next');
  assert.ok(await media.evaluate((el, time) => el.paused && el.currentTime === time, pausedTime));
  assert.equal(await page.evaluate(() => window.sourceChanges), 0);
  await button('Show queue').click();
  assert.deepEqual(await upcoming.locator('p.font-semibold').allTextContents(), ['Test song 2', 'Test song 1', 'Test song 2']);
  await panel.getByRole('button', { name: 'Repeat one', exact: true }).click();
  await button('Next Track').click();
  await playing('/2.wav');
  // Let actual ended events exercise the provider, including replaying one occurrence.
  await media.evaluate(el => { el.currentTime = el.duration - 0.05; });
  await page.waitForFunction(() => { const el = document.querySelector('video'); return el.currentSrc.endsWith('/2.wav') && !el.paused && el.currentTime < 5; });
  await panel.getByRole('button', { name: 'Repeat all', exact: true }).click();
  await button('Clear upcoming').click();
  assert.equal(await upcoming.count(), 0);
  await media.evaluate(el => { el.currentTime = el.duration - 0.05; });
  await playing('/1.wav');
  await panel.getByRole('button', { name: 'Off', exact: true }).click();
  await button('Next Track').click();
  await playing('/2.wav');
  await media.evaluate(el => { el.currentTime = el.duration - 0.05; });
  await page.waitForFunction(() => document.querySelector('video').ended);
  assert.ok(await button('Next Track').isDisabled());
  await button('Close queue').click();
  await songMenu(0, 'Play next');
  assert.ok(await media.evaluate(el => el.paused && el.ended), 'completed media must stay stopped');
  await button('Next Track').click();
  await playing('/1.wav');
  await button('Pause').click();
  // Cycle via keyboard in the player, then inspect direct mode controls on narrow screens.
  const cycle = bar.getByRole('button', { name: /^Repeat:/ });
  await cycle.focus();
  await page.keyboard.press('Enter');
  assert.match(await cycle.getAttribute('aria-label'), /^Repeat: one/);
  for (const [width, height] of [[1280, 900], [390, 460], [320, 568]]) {
    await page.setViewportSize({ width, height });
    await button('Show queue').click();
    assert.equal(await panel.getByRole('button', { name: 'Repeat one', exact: true }).getAttribute('aria-pressed'), 'true');
    for (const element of [bar, panel]) {
      assert.ok(await element.evaluate(el => el.scrollWidth <= el.clientWidth), `overflow at ${width}px`);
    }
    const controls = await panel.getByRole('group', { name: 'Repeat mode' }).getByRole('button').evaluateAll(buttons => buttons.map(el => {
      const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, height: r.height };
    }));
    assert.ok(controls.every(r => r.x >= 0 && r.right <= width && r.y >= 0 && r.bottom <= height && r.height >= 44));
    await page.screenshot({ path: join(tmpdir(), `anime-repeat-${width}.png`) });
    await page.keyboard.press('Escape');
    assert.ok(await button('Show queue').evaluate(el => el === document.activeElement));
    const trigger = page.getByRole('button', { name: 'More song actions', exact: true }).filter({ visible: true }).last();
    await trigger.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    await trigger.click();
    assert.ok(await page.getByRole('menuitem', { name: 'Play next', exact: true }).isDisabled(), 'unavailable media must disable Play next');
    await page.keyboard.press('Escape');
  }
  await page.reload();
  await bar.waitFor();
  assert.ok(await media.evaluate(el => el.paused), 'restored queue must stay paused');
  assert.match(await cycle.getAttribute('aria-label'), /^Repeat: one/);
  assert.deepEqual(errors, []);
  console.log('PASS: Play next/append order, duplicates, real ended/repeat behavior, paused and completed media, keyboard/focus, unavailable tracks, 1280/390/320px layout and paused restoration.');
} finally { await close(); }
