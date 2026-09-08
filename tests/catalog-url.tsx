import React, { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { DatabaseMode } from '../src/types';
import { catalogSearchShareUrl } from '../src/services/catalogUrlState';
import { useCatalogSearchState } from '../src/services/useCatalogSearchState';

let controller: ReturnType<typeof useCatalogSearchState>;
let changeMode: (mode: DatabaseMode) => void;
let currentMode: DatabaseMode;
function Harness() {
  const [mode, setMode] = useState<DatabaseMode>('anisongdb');
  controller = useCatalogSearchState(mode, setMode);
  changeMode = setMode;
  currentMode = mode;
  return <output>{JSON.stringify({ mode, ...controller.state })}</output>;
}
const root = createRoot(document.getElementById('root')!);
let revision = 0;
const mount = () => root.render(<StrictMode><Harness key={revision++} /></StrictMode>);
const wait = (ms = 40) => new Promise(resolve => setTimeout(resolve, ms));
const check = (ok: boolean, message: string) => { if (!ok) throw new Error(message); };
async function navigate(direction: 'back' | 'forward') {
  await new Promise<void>(resolve => {
    window.addEventListener('popstate', () => resolve(), { once: true });
    history[direction]();
  });
  await wait();
}
document.getElementById('run')!.onclick = async () => {
  const result = document.getElementById('result')!;
  result.textContent = 'Running…';
  try {
    history.replaceState({ retained: true }, '', `${location.pathname}?q=Heike&page=3&play=song-34830&extra=keep#songs`);
    mount();
    await wait();
    check(controller.state.q === 'Heike' && controller.state.page === 2, 'Shared URL restoration');
    const initialLength = history.length;
    controller.typeQuery('private note phrase');
    await wait();
    check(location.search.includes('q=Heike'), 'Typing waits for debounce before removing shared URL');
    await wait(250);
    check(location.search === '?play=song-34830&extra=keep', 'Ordinary typing removes catalog parameters');
    check(history.length === initialLength, 'Typing replaces internal history');
    controller.update({ season: 'Fall' });
    await wait();
    check(history.length === initialLength + 1 && !location.search.includes('season'), 'Filter pushes state without URL parameters');
    controller.update({ page: 2 });
    await wait();
    await navigate('back');
    check(controller.state.season === 'Fall' && controller.state.page === 0, 'Back restores internal page');
    await navigate('back');
    check(controller.state.season === 'ALL' && controller.state.q === 'private note phrase', 'Back restores internal filter');
    await navigate('forward');
    check(controller.state.season === 'Fall', 'Forward restores internal filter');
    controller.typeQuery('uncommitted');
    await wait();
    await navigate('back');
    await wait(250);
    check(controller.state.draft === 'private note phrase' && !location.search.includes('uncommitted'), 'Navigation cancels pending typing');
    const internalUrl = location.href;
    const shared = new URL(catalogSearchShareUrl(controller.state, new URL(location.href)));
    check(shared.searchParams.get('q') === 'private note phrase', 'Explicit share contains current query');
    check(shared.searchParams.get('play') === null && shared.searchParams.get('extra') === 'keep', 'Search share omits play and preserves unrelated state');
    check(location.href === internalUrl, 'Generating a share link does not change the address bar');
    changeMode('notes');
    await wait();
    controller.typeQuery('private fixture note');
    await wait(250);
    controller.update({ yearMin: 2000 });
    await wait();
    check(location.href === internalUrl, 'Private tabs never change URL');
    changeMode('collection');
    await wait();
    controller.typeQuery('private saved search');
    await wait(250);
    check(location.href === internalUrl && controller.state.sortKey === 'id', 'Saved search remains separate');
    await navigate('forward');
    check(currentMode === 'anisongdb' && controller.state.draft === 'private note phrase', 'History exits private view without leakage');
    controller.update({ q: '', draft: '', artistIds: [54, 12], artistLabel: 'Example' });
    await wait();
    check(!location.search.includes('artists'), 'Exact artist remains internal during browsing');
    const artistShare = new URL(catalogSearchShareUrl(controller.state, new URL(location.href)));
    check(artistShare.searchParams.get('artists') === '12,54' && !artistShare.searchParams.has('q'), 'Explicit share serializes canonical IDs');
    mount();
    await wait();
    check(controller.state.artistIds.join(',') === '12,54', 'Current history state survives remount');
    controller.reset();
    await wait();
    check(location.search === '?play=song-34830&extra=keep' && location.hash === '#songs', 'Reset preserves unrelated URL state');
    check(history.state.retained === true, 'Existing history payload survives');
    result.textContent = 'PASS: shared-link restore, internal debounce/history, Back/Forward, pending typing cancellation, explicit share generation, private-tab isolation, artists, reset, unrelated parameters and history payload (StrictMode).';
  } catch (error) {
    result.textContent = `FAIL: ${error instanceof Error ? error.message : String(error)}`;
  }
};
