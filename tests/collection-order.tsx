import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../src/App';
import '../src/index.css';
import { LOCAL_STORAGE_KEY } from '../src/services/api';
import { PLAYLISTS_STORAGE_KEY } from '../src/services/playlistsStorage';

// Isolate the entire app from the user's persistent browser data.
const data = new Map<string, string>();
Object.defineProperty(window, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => { data.set(key, value); },
  removeItem: (key: string) => { data.delete(key); },
  clear: () => data.clear(), key: (index: number) => [...data.keys()][index] ?? null,
  get length() { return data.size; },
} });
const songs = [11, 23, 45, 68, 90].map((id, i) => ({
  id, local_song_id: `test-${id}`, anime_name: `Test anime ${i + 1}`, anime_year: 2024,
  artist: 'Test artist', song_name: `Test song ${i + 1}`, theme_type: 'OP 1',
}));
function seed() {
  data.set(LOCAL_STORAGE_KEY, JSON.stringify(songs));
  data.set(PLAYLISTS_STORAGE_KEY, JSON.stringify({ version: 1, playlists: [{
    id: 'test-playlist', name: 'Order test playlist', songs: songs.map(song => ({
      songId: song.local_song_id, source: 'local', snapshot: song,
    })),
  }] }));
}
seed();
const root = createRoot(document.getElementById('root')!);
let revision = 0;
const mount = () => root.render(<App key={revision++} />);
mount();
const wait = (ms = 80) => new Promise(resolve => setTimeout(resolve, ms));
const check = (ok: boolean, message: string) => { if (!ok) throw new Error(message); };
const visible = (el: HTMLElement) => el.offsetWidth > 0 && el.offsetHeight > 0;
const rows = () => [...document.querySelectorAll<HTMLElement>('[data-song-row]')].filter(visible);
async function until(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await wait(50); }
  throw new Error('Timed out waiting for app state');
}
async function button(label: string) {
  const find = () => {
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('button')].filter(visible);
    return buttons.find(el => el.textContent?.trim() === label || el.getAttribute('aria-label') === label)
      ?? buttons.find(el => el.textContent?.trim().startsWith(label));
  };
  await until(() => Boolean(find()));
  find()!.click();
  await wait();
}
async function openSaved() { await button('My Collection'); await button('Saved Songs'); await until(() => rows().length > 0); }
const numbers = () => rows().map(row => row.querySelector('[data-song-number]')?.textContent).join();
const storedIds = () => JSON.parse(data.get(LOCAL_STORAGE_KEY)!).map(song => song.id).join();
const playlistIds = () => JSON.parse(data.get(PLAYLISTS_STORAGE_KEY)!).playlists[0].songs.map(song => song.songId).join();
async function drag(from: number, to: number, beforeRelease: () => void) {
  rows()[from].scrollIntoView({ block: 'center' });
  await wait(150);
  const row = rows()[from];
  const handle = row.querySelector<HTMLElement>('[data-song-drag-handle]')!;
  const start = handle.getBoundingClientRect();
  const end = rows()[to].querySelector('[data-song-drag-handle]')!.getBoundingClientRect();
  const x = start.left + start.width / 2;
  const y = start.top + start.height / 2;
  const endY = end.top + end.height / 2;
  const event = (type: string, clientY: number) => new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerType: matchMedia('(max-width: 767px)').matches ? 'touch' : 'mouse', pointerId: 1, isPrimary: true,
    button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY,
  });
  handle.dispatchEvent(event('pointerdown', y));
  for (let step = 1; step <= 36; step++) {
    window.dispatchEvent(event('pointermove', y + (endY - y) * step / 36));
    await wait(20);
  }
  try { beforeRelease(); }
  finally { window.dispatchEvent(event('pointerup', endY)); }
  await wait(500);
}
document.getElementById('run')!.onclick = async () => {
  const result = document.getElementById('result')!;
  const run = document.getElementById('run') as HTMLButtonElement;
  run.disabled = true;
  result.textContent = 'Running…';
  const passed: string[] = [];
  try {
    seed(); mount(); await wait(150);
    await openSaved();
    check(numbers() === '1,2,3,4,5', 'Saved # must be consecutive despite gaps in stable IDs');
    await drag(4, 1, () => {
      check(storedIds() === '11,90,23,45,68', 'Saved fifth-to-second order must update before release');
      check(rows()[1].textContent!.includes('Test song 5'), 'Visible saved rows must move during drag');
    });
    passed.push('Saved songs animate and persist fifth-to-second order during drag');
    rows()[2].querySelector<HTMLButtonElement>('[aria-label="Remove from saved songs"]')!.click();
    await until(() => rows().length === 4);
    check(numbers() === '1,2,3,4' && storedIds() === '11,90,45,68', 'Delete must close # gaps and preserve remaining identities');
    passed.push('Saved removal updates # without changing stable IDs');
    mount(); await wait(150); await openSaved();
    check(rows()[1].textContent!.includes('Test song 5') && numbers() === '1,2,3,4', 'Saved order must survive app remount');
    passed.push('Saved custom order survives remount');
    await button('My Collection');
    await button('Order test playlist');
    await until(() => rows().length === 5);
    await drag(4, 1, () => {
      check(playlistIds() === 'test-11,test-90,test-23,test-45,test-68', 'Playlist must persist live fifth-to-second order');
      check(rows()[1].textContent!.includes('Test song 5'), 'Playlist rows must shift before release');
    });
    passed.push('Playlist songs animate and persist live reorder');
    rows()[2].querySelector<HTMLButtonElement>('[aria-label="More song actions"]')!.click(); await wait();
    await button('Remove from playlist');
    await button('Remove song');
    await until(() => rows().length === 4);
    check(numbers() === '1,2,3,4', 'Playlist deletion must update #');
    check(storedIds() === '11,90,45,68', 'Playlist editing must not alter saved songs');
    passed.push('Playlist removal updates # independently of Saved Songs');
    mount(); await wait(150); await button('My Collection'); await button('Order test playlist');
    await until(() => rows().length === 4);
    check(rows()[1].textContent!.includes('Test song 5'), 'Playlist order must survive remount');
    const key = rows()[1].dataset.songRow;
    rows()[1].dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, altKey: true, key: 'ArrowUp' }));
    await wait(500);
    check(rows()[0].dataset.songRow === key, 'Keyboard alternative must reorder playlist');
    passed.push('Playlist order survives remount and keyboard reordering works');
    result.textContent = `PASS: ${passed.length} checks\n${passed.join('\n')}`;
  } catch (error) { result.textContent = `FAIL: ${error}\n${passed.join('\n')}`; }
  finally { run.disabled = false; }
};
