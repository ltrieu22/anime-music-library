import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../src/App';
import { LOCAL_STORAGE_KEY } from '../src/services/api';
import { PLAYER_VOLUME_STORAGE_KEY } from '../src/services/playerVolume';
import '../src/index.css';

const saved = new Map<string, string>([[PLAYER_VOLUME_STORAGE_KEY, JSON.stringify({ version: 1, volume: 0.26 })]]);
Object.defineProperty(window, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => saved.get(key) ?? null,
  setItem: (key: string, value: string) => { saved.set(key, value); },
  removeItem: (key: string) => { saved.delete(key); },
} });
const catalog = [
  { id: 'song-34830', anime_name: 'Heike', anime_year: 2021, song_name: 'Linked Song', artist: 'Artist', theme_type: 'OP 1', video_url: 'fixture.webm' },
  { id: 'song-34831', anime_name: 'Heike', anime_year: 2021, song_name: 'Audio Song', artist: 'Artist', theme_type: 'ED 1', audio_url: 'fixture.mp3' },
  { id: 'song-34832', anime_name: 'Heike', anime_year: 2021, song_name: 'Missing Media', artist: 'Artist', theme_type: 'ED 2' },
];
window.fetch = async input => new Response(JSON.stringify(String(input).includes('anime_catalog.json') ? catalog : {}), { headers: { 'Content-Type': 'application/json' } });
let blocked = true;
let sourceWrites = 0;
let source = '';
Object.defineProperty(HTMLMediaElement.prototype, 'src', { configurable: true,
  get: () => source, set: (value: string) => { source = value; sourceWrites++; } });
HTMLMediaElement.prototype.play = function () {
  if (blocked) return Promise.reject(new DOMException('Blocked', 'NotAllowedError'));
  this.dispatchEvent(new Event('play'));
  return Promise.resolve();
};
HTMLMediaElement.prototype.pause = function () { this.dispatchEvent(new Event('pause')); };
HTMLMediaElement.prototype.load = function () {};
let shared = 0;
let copied = '';
let nativeResult: 'success' | 'cancel' | 'failure' = 'success';
let clipboardFails = false;
Object.defineProperty(navigator, 'share', { configurable: true, value: async () => {
  shared++;
  if (nativeResult === 'cancel') throw new DOMException('Cancelled', 'AbortError');
  if (nativeResult === 'failure') throw new Error('Denied');
} });
Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => {
  if (clipboardFails) throw new Error('Denied');
  copied = text;
} } });
const root = createRoot(document.getElementById('root')!);
let revision = 0;
const wait = (ms = 35) => new Promise(resolve => setTimeout(resolve, ms));
const check = (ok: boolean, message: string) => { if (!ok) throw new Error(message); };
async function until(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await wait(); }
  throw new Error('Timed out waiting for UI');
}
const text = () => document.getElementById('root')!.textContent || '';
async function button(label: string) {
  const find = () => {
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('button')];
    return buttons.find(button => button.getAttribute('aria-label') === label || button.textContent?.trim() === label)
      ?? buttons.find(button => button.textContent?.trim().startsWith(label));
  };
  await until(() => Boolean(find()));
  find()!.focus();
  find()!.click();
  await wait();
}
async function navigate(search: string) {
  history.pushState({}, '', `${location.pathname}?${search}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
  await wait();
}
document.getElementById('run')!.onclick = async () => {
  const result = document.getElementById('result')!;
  result.textContent = 'Running…';
  try {
    blocked = true;
    history.replaceState({}, '', `${location.pathname}?play=song-34830&q=no-results&page=99`);
    root.render(<StrictMode><App key={revision++} /></StrictMode>);
    await until(() => text().includes('Press Play to listen.'));
    check(text().includes('Linked Song') && text().includes('No results'), 'Link ignores filters and page');
    check(document.querySelector('video')!.volume === 0.26, 'Remembered volume applies before playback');
    blocked = false;
    await button('Play');
    check(!text().includes('Press Play to listen.'), 'Play recovers blocked autoplay');
    const writes = sourceWrites;
    await navigate('play=song-34830&season=Fall');
    await button('Reset');
    check(sourceWrites === writes, 'Filter navigation and reset never restart shared media');
    await button('Share current song');
    await button('Share');
    check(shared === 1 && text().includes('Song shared.'), 'Native share success');
    nativeResult = 'cancel';
    await button('Share');
    check(!copied && text().includes('Sharing cancelled.'), 'Cancellation does not copy');
    nativeResult = 'failure';
    await button('Share');
    check(copied.includes('play=song-34830') && text().includes('Link copied.'), 'Native failure falls back to clipboard');
    clipboardFails = true;
    await button('Copy link');
    check(text().includes('Select the link below'), 'Clipboard failure exposes manual fallback');
    const input = document.querySelector<HTMLInputElement>('dialog input')!;
    check(input.selectionEnd === input.value.length && input.selectionStart === 0, 'Fallback link is selected');
    await button('Close');
    check(document.activeElement?.getAttribute('aria-label') === 'Share current song', 'Dialog restores focus');
    await button('More song actions');
    await button('Share song');
    check(Boolean(document.querySelector('dialog[open] input')), 'Row action opens share dialog');
    await button('Close');
    await navigate('play=song-34831&q=hidden');
    await until(() => source.endsWith('fixture.mp3'));
    check(text().includes('Audio Song'), 'Audio-only shared link prepares intended song');
    await navigate('play=song-99999');
    check(text().includes('no longer in the public catalog'), 'Missing ID explained');
    await navigate('play=song-34832');
    check(text().includes('no playable media'), 'Missing media explained');
    await navigate('play=invalid');
    check(text().includes('invalid song ID'), 'Malformed ID explained');
    document.querySelector('video')!.dispatchEvent(new Event('error'));
    await wait();
    check(text().includes('media could not be loaded'), 'Media loading failure explained');
    saved.set(LOCAL_STORAGE_KEY, JSON.stringify([
      { ...catalog[0], id: 9, source_song_id: 'song-34830' },
      { id: 10, local_song_id: 'custom', anime_name: 'Custom', song_name: 'Custom Song', anime_year: 2020, artist: 'Artist', video_url: 'custom.webm' },
    ]));
    history.replaceState({}, '', location.pathname);
    root.render(<StrictMode><App key={revision++} /></StrictMode>);
    await wait();
    await button('My Collection');
    await button('Saved Songs');
    await button('Linked Song');
    await button('Share current song');
    check(document.querySelector<HTMLInputElement>('dialog input')!.value.includes('play=song-34830'), 'Saved player shares source identity');
    await button('Close');
    await button('Custom Song');
    await button('Share current song');
    check(text().includes('custom song has no public catalog link'), 'Custom player explains unavailable link');
    await button('Close');
    result.textContent = 'PASS: full-app deep links, filter isolation, no restarts, blocked autoplay recovery, volume, native share/cancel/failure, copy/manual fallback, focus, row action, audio-only links, invalid/missing IDs/media, saved identity and custom songs (StrictMode).';
  } catch (error) { result.textContent = `FAIL: ${error instanceof Error ? error.message : error}`; }
};
