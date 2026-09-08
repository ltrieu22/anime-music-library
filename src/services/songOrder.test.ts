import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reorderSongSubset } from './songOrder';
import { reorderSavedSongs, deleteEntry, fetchEntries, LOCAL_STORAGE_KEY } from './api';

test('reordering a filtered subset preserves hidden slots, IDs and original objects', () => {
  const songs = [11, 23, 45, 68, 90].map(id => ({ id, note: `note-${id}` }));
  const next = reorderSongSubset(songs, ['90', '23', '68'], song => String(song.id));
  assert.deepEqual(next.map(song => song.id), [11, 90, 45, 23, 68]);
  assert.equal(next[1], songs[4]);
  assert.deepEqual(songs.map(song => song.id), [11, 23, 45, 68, 90]);
  assert.throws(() => reorderSongSubset(songs, ['23', '23'], song => String(song.id)));
  assert.throws(() => reorderSongSubset(songs, ['999'], song => String(song.id)));
});

test('saved song order survives reload and deletion without renumbering identities; failed writes stay unchanged', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const songs = [11, 23, 45, 68, 90].map(id => ({ id, anime_name: 'Anime', anime_year: 2024, artist: 'Artist', song_name: `Song ${id}`, local_song_id: `local-${id}` }));
  const data = new Map([[LOCAL_STORAGE_KEY, JSON.stringify(songs)], ['anime-db:notes', 'untouched']]);
  let fail = false;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { if (fail) throw new Error('Storage full'); data.set(key, value); },
  } });
  try {
    reorderSavedSongs([11, 90, 23, 45, 68]);
    assert.deepEqual((await fetchEntries()).map(song => song.id), [11, 90, 23, 45, 68]);
    await deleteEntry(23);
    assert.deepEqual((await fetchEntries()).map(song => song.id), [11, 90, 45, 68]);
    const before = data.get(LOCAL_STORAGE_KEY);
    fail = true;
    assert.throws(() => reorderSavedSongs([90, 11, 45, 68]), /Storage full/);
    assert.equal(data.get(LOCAL_STORAGE_KEY), before);
    assert.equal(data.get('anime-db:notes'), 'untouched');
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});
