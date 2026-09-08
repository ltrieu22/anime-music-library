import React, { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { DatabaseMode } from '../src/types';
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
const query = () => new URL(location.href).searchParams;
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
    check(controller.state.q === 'Heike' && controller.state.page === 2, 'Initial URL restoration');
    const initialLength = history.length;
    controller.typeQuery('fhána');
    await wait();
    check(query().get('q') === 'Heike', 'Typing waits for debounce');
    await wait(250);
    check(query().get('q') === 'fhána' && controller.state.page === 0, 'Typing updates URL and resets page');
    check(history.length === initialLength, 'Typing replaces history');
    controller.update({ season: 'Fall' });
    await wait();
    check(history.length === initialLength + 1, 'Filter pushes history');
    controller.update({ page: 2 });
    await wait();
    await navigate('back');
    check(controller.state.season === 'Fall' && controller.state.page === 0, 'Back restores page');
    await navigate('back');
    check(controller.state.season === 'ALL', 'Back restores filter');
    await navigate('forward');
    check(controller.state.season === 'Fall', 'Forward restores filter');
    controller.typeQuery('uncommitted');
    await wait();
    await navigate('back');
    await wait(250);
    check(controller.state.draft === 'fhána' && query().get('q') === 'fhána', 'Navigation cancels pending typing');
    const publicUrl = location.href;
    changeMode('notes');
    await wait();
    controller.typeQuery('private fixture note');
    await wait(250);
    controller.update({ yearMin: 2000 });
    await wait();
    check(location.href === publicUrl, 'Private query and filters never change URL');
    changeMode('anisongdb');
    await wait();
    check(controller.state.draft === 'fhána' && controller.state.yearMin === 1924, 'Returning restores public state');
    changeMode('collection');
    await wait();
    controller.typeQuery('private saved search');
    await wait(250);
    check(location.href === publicUrl && controller.state.sortKey === 'id', 'Saved search stays private with default order');
    await navigate('forward');
    check(currentMode === 'anisongdb' && controller.state.draft === 'fhána', 'History exits private view without leaking its query');
    controller.update({ q: '', draft: '', artistIds: [54, 12], artistLabel: 'Example' });
    await wait();
    check(query().get('artists') === '12,54' && !query().has('q'), 'Canonical IDs serialize without display label');
    mount();
    await wait();
    check(controller.state.artistIds.join(',') === '12,54', 'Remount restores canonical IDs');
    controller.typeQuery('');
    await wait();
    check(!query().has('artists'), 'Clearing an artist with empty query updates URL');
    controller.reset();
    await wait();
    check(location.search === '?play=song-34830&extra=keep' && location.hash === '#songs', 'Reset preserves unrelated URL state');
    check(history.state.retained === true, 'Existing history payload preserved');
    result.textContent = 'PASS: restore/remount, debounce, push/replace, Back/Forward, pending typing cancellation, private tab isolation, artists, reset, reserved parameters and history payload (StrictMode).';
  } catch (error) {
    result.textContent = `FAIL: ${error instanceof Error ? error.message : String(error)}`;
  }
};
