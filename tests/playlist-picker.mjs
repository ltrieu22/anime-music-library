import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startBrowserHarness } from '../scripts/browser-harness.mjs';

const { browser, base, close } = await startBrowserHarness();
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  const open = async () => {
    await page.locator('#search-input').fill('Heike');
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 2);
    await page.getByRole('button', { name: 'More song actions', exact: true }).first().click();
    await page.getByRole('menuitem', { name: 'Add to playlist', exact: true }).click();
    await page.getByRole('dialog', { name: 'Add to playlist' }).waitFor();
  };
  await page.goto(`${base}/anime_db/`);
  await open();
  const dialog = page.getByRole('dialog', { name: 'Add to playlist' });
  const closeButton = page.getByRole('button', { name: 'Close playlist picker' });
  const name = page.getByLabel('New playlist name');
  const create = page.getByRole('button', { name: 'Create and add song' });
  await dialog.getByText('Create your first playlist below.').waitFor();
  assert.ok(await create.isDisabled());
  assert.ok(await closeButton.evaluate(el => el === document.activeElement));
  await name.fill('Evening favorites');
  await page.keyboard.press('Enter');
  const row = dialog.getByRole('button', { name: 'Evening favorites 1 song Added', exact: true });
  await row.waitFor();
  assert.equal(await row.getAttribute('aria-pressed'), 'true');
  await row.focus();
  await page.keyboard.press('Space');
  await dialog.getByRole('button', { name: 'Evening favorites 0 songs Add', exact: true }).waitFor();
  await page.keyboard.press('Enter');
  await row.waitFor();
  await name.fill('Evening favorites');
  await create.click();
  await dialog.getByRole('alert').filter({ hasText: 'already exists' }).waitFor();
  await name.fill('Night drive');
  await create.click();
  await dialog.getByRole('button', { name: 'Night drive 1 song Added', exact: true }).waitFor();
  await page.evaluate(() => {
    window.originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'anime-db:playlists') throw new DOMException('Quota', 'QuotaExceededError');
      return window.originalSetItem.call(this, key, value);
    };
  });
  await row.click();
  await dialog.getByRole('alert').filter({ hasText: 'Could not save playlists' }).waitFor();
  assert.equal(await row.getAttribute('aria-pressed'), 'true');
  await name.fill('Failed playlist');
  await create.click();
  assert.equal(await dialog.getByRole('button', { name: /Failed playlist/ }).count(), 0);
  assert.equal(await name.inputValue(), 'Failed playlist');
  await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
  await name.fill('A long playlist name for late night anime openings and ending songs');
  await create.click();
  await row.click(); // Show both selected and unselected rows.
  await page.screenshot({ path: join(tmpdir(), 'playlist-picker-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(tmpdir(), 'playlist-picker-mobile.png') });
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 460 }]) {
    await page.setViewportSize(viewport);
    assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth));
    await name.fill('Keyboard focus');
    await create.focus();
    await page.keyboard.press('Tab');
    assert.ok(await closeButton.evaluate(el => el === document.activeElement));
    await page.keyboard.press('Shift+Tab');
    assert.ok(await create.evaluate(el => el === document.activeElement));
  }
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.ok(await page.getByRole('button', { name: 'More song actions', exact: true }).first().evaluate(el => el === document.activeElement));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  await open();
  await dialog.getByRole('button', { name: 'Night drive 1 song Added', exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'Evening favorites 0 songs Add', exact: true }).waitFor();
  assert.equal(await dialog.getByRole('button', { name: /Failed playlist/ }).count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: playlist empty state, counts, selected states, keyboard toggle/create, duplicate name, atomic storage failure, mobile overflow/focus, Escape and persistence');
  await context.close();

  const recovery = await browser.newContext();
  const retryPage = await recovery.newPage();
  let failWorker = true;
  await retryPage.route('**/*', route => {
    const url = route.request().url();
    if (!url.startsWith(base)) return route.abort();
    if (failWorker && url.includes('/assets/catalog.worker-')) return route.abort();
    return route.continue();
  });
  await retryPage.goto(`${base}/anime_db/`);
  await retryPage.getByRole('heading', { name: 'Catalog unavailable' }).waitFor();
  failWorker = false;
  await retryPage.getByRole('button', { name: 'Retry', exact: true }).click();
  await retryPage.waitForFunction(() => document.querySelectorAll('tbody tr').length === 100);
  console.log('PASS: failed production worker load recovers through Retry without reload');
  await recovery.close();
} finally { await close(); }
