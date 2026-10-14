import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startBrowserHarness } from '../scripts/browser-harness.mjs';
const { browser, base, close } = await startBrowserHarness();
try {
  const context = await browser.newContext({ hasTouch: true, reducedMotion: 'reduce' });
  await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  await context.addInitScript(() => {
    const track = { id: 'mobile-track', animeTitle: 'Long anime title '.repeat(20), songName: 'Long song title '.repeat(20), artist: 'Artist', videoUrl: '/missing-test-media.wav' };
    localStorage.setItem('anime-db:player-session-v1', JSON.stringify({ version: 1, items: [0, 1].map(i => ({ queueItemId: `mobile:${i}`, track })), index: 0, source: 'collection', repeatMode: 'off', position: 0 }));
    localStorage.setItem('anime_songs_db_v1', JSON.stringify([{ id: 1, local_song_id: 'mobile-long', anime_name: 'LongAnimeTitle'.repeat(15), song_name: 'LongSongTitle'.repeat(15), artist: 'LongArtist'.repeat(15), anime_year: 2024 }]));
  });
  const page = await context.newPage();
  await page.goto(`${base}/anime_db/`);
  await page.locator('.mobile-song-cards').waitFor({ state: 'attached' });
  for (const width of [320, 390, 640, 768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 740 });
    await page.getByRole('button', { name: 'Catalog', exact: true }).click();
    await page.getByRole('button', { name: '2020s', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '2020s', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Openings', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Openings', exact: true }).getAttribute('aria-pressed'), 'true');
    const issues = await page.evaluate(() => {
      const issues = [];
      if (document.documentElement.scrollWidth > innerWidth + 1) issues.push('page overflow');
      for (const el of document.querySelectorAll('nav[aria-label="Main navigation"] button, .catalog-filters button')) {
        const r = el.getBoundingClientRect();
        if (r.left < 0 || r.right > innerWidth + 1) issues.push(`offscreen: ${el.textContent}`);
        if (innerWidth < 640 && r.height < 44) issues.push(`small target: ${el.textContent}`);
      }
      return issues;
    });
    assert.deepEqual(issues, [], `${width}px catalog`);
    await page.getByRole('button', { name: /^(My Collection|Collection)/ }).first().click();
    await page.getByRole('button', { name: /^Saved Songs/ }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${width}px long collection titles`);
    await page.getByRole('button', { name: 'Show queue', exact: true }).click();
    const queue = await page.locator('#playback-queue').boundingBox();
    const player = await page.locator('#spotify-music-player').boundingBox();
    assert.ok(queue.y >= 0 && queue.y + queue.height <= player.y, `${width}px queue clears player`);
    assert.ok(queue.x >= 0 && queue.x + queue.width <= width, `${width}px queue fits screen`);
    await page.getByRole('button', { name: 'Close queue', exact: true }).click();
    if (width === 390) {
      await page.waitForTimeout(350);
      await page.screenshot({ path: join(tmpdir(), 'anime-db-mobile-layout-390.png') });
      await page.getByRole('button', { name: 'Catalog', exact: true }).click();
      await page.waitForTimeout(350);
      await page.screenshot({ path: join(tmpdir(), 'anime-db-mobile-catalog-390.png') });
    }
  }
  console.log('Mobile navigation, filters, touch targets and long titles pass at six widths.');
} finally { await close(); }
