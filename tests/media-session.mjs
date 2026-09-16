import assert from 'node:assert/strict';
import { startBrowserHarness } from '../scripts/browser-harness.mjs';

const wav = Buffer.alloc(44 + 8000 * 2 * 120);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
const { browser, base, close } = await startBrowserHarness();
try {
  for (const mode of ['supported', 'partial', 'absent']) {
    const context = await browser.newContext();
    await context.route('**/*', route => {
      if (route.request().url().startsWith(`${base}/test-media/`)) {
        const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range || '');
        const start = range ? Number(range[1]) : 0;
        const end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
        return route.fulfill({ status: range ? 206 : 200, contentType: 'audio/wav', body: wav.subarray(start, end + 1),
          headers: { 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${wav.length}` } : {}) } });
      }
      return route.request().url().startsWith(base) ? route.continue() : route.abort();
    });
    await context.addInitScript(({ base, mode }) => {
      window.playCalls = 0;
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (...args) { window.playCalls++; return play.apply(this, args); };
      const session = { metadata: null, playbackState: 'none', position: null, handlers: {},
        setActionHandler(action, handler) {
          if (mode === 'partial' && action.startsWith('seek')) throw new Error('Unsupported action');
          this.handlers[action] = handler;
        },
        setPositionState(position) {
          if (mode === 'partial') throw new Error('Unsupported position');
          if (position && (!Number.isFinite(position.duration) || position.position < 0 || position.position > position.duration)) throw new Error('Invalid position');
          this.position = position || null;
        } };
      Object.defineProperty(navigator, 'mediaSession', { value: mode === 'absent' ? undefined : session, configurable: true });
      window.device = session;
      const tracks = [1, 2].map(id => ({ id, animeTitle: `Anime ${id}`, songName: `Song ${id}`, artist: 'Artist', videoUrl: `${base}/test-media/${id}.wav` }));
      if (!localStorage.getItem('seeded')) {
        localStorage.setItem('anime-db:player-session-v1', JSON.stringify({ version: 1,
          items: tracks.map((track, index) => ({ queueItemId: `queue:${index + 1}`, track })),
          index: 0, source: 'collection', repeatMode: 'off', position: 20 }));
        localStorage.setItem('seeded', 'true');
      }
    }, { base, mode });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const action = (name, details = {}) => page.evaluate(({ name, details }) => window.device.handlers[name]({ action: name, ...details }), { name, details });
    const wait = fn => page.waitForFunction(fn);
    await page.goto(`${base}/anime_db/`);
    await wait(() => document.querySelector('video')?.readyState >= 2 && document.querySelector('video').currentTime >= 19);
    assert.equal(await page.evaluate(() => window.playCalls), 0, 'restoration never plays');
    if (mode !== 'absent') {
      await wait(() => window.device.metadata?.title === 'Song 1' && window.device.playbackState === 'paused');
      assert.equal(await page.evaluate(() => window.device.metadata.album), 'Anime 1');
      await action('play');
      await wait(() => window.device.playbackState === 'playing');
      await action('play');
      assert.equal(await page.evaluate(() => document.querySelector('video').paused), false, 'Play is idempotent');
      await action('pause'); await action('pause');
      await wait(() => window.device.playbackState === 'paused');
      if (mode === 'supported') {
        await action('seekto', { seekTime: 50 });
        await wait(() => window.device.position?.position === 50);
        await action('seekbackward', { seekOffset: 7 });
        await wait(() => window.device.position?.position === 43);
        await action('seekforward');
        await wait(() => window.device.position?.position === 53);
        await action('seekto', { seekTime: -5 });
        await wait(() => window.device.position?.position === 0);
        await action('seekto', { seekTime: Infinity });
        assert.equal(await page.evaluate(() => document.querySelector('video').currentTime), 0);
        await action('seekto', { seekTime: 999 });
        await wait(() => window.device.position?.position === 120);
        await action('seekto', { seekTime: 20 });
        await action('previoustrack');
        await wait(() => document.querySelector('video').currentTime === 0);
      }
      await action('nexttrack');
      await wait(() => window.device.metadata?.title === 'Song 2' && window.device.playbackState === 'playing');
      assert.equal(await page.evaluate(() => window.device.handlers.nexttrack), null, 'no next action at tail with repeat off');
      await page.getByRole('button', { name: /^Repeat:/ }).click();
      await page.getByRole('button', { name: /^Repeat:/ }).click();
      await wait(() => typeof window.device.handlers.nexttrack === 'function');
      await action('nexttrack');
      await wait(() => window.device.metadata?.title === 'Song 1');
      await action('pause');
      if (mode === 'supported') await action('seekto', { seekTime: 0 });
      await action('previoustrack');
      await wait(() => window.device.metadata?.title === 'Song 2');
      await action('pause');
      await page.reload();
      await wait(() => window.device.metadata?.title === 'Song 2' && window.device.playbackState === 'paused');
      assert.equal(await page.evaluate(() => window.playCalls), 0);
    } else {
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await wait(() => !document.querySelector('video').paused);
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Close Player', exact: true }).click();
    if (mode !== 'absent') {
      await wait(() => window.device.metadata === null && window.device.playbackState === 'none');
      assert.equal(await page.evaluate(() => Object.values(window.device.handlers).every(handler => handler === null)), true);
      assert.equal(await page.evaluate(() => window.device.position), null);
    }
    assert.deepEqual(errors, []);
    console.log(`PASS Media Session: ${mode}`);
    await context.close();
  }
} finally { await close(); }
