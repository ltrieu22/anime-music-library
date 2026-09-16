import { test } from 'node:test';
import assert from 'node:assert/strict';
import { removeSavedSong, restoreSavedSong } from './removalUndo';
import { changePlaylists, loadPlaylists, songReferenceKey } from './playlistsStorage';
import { LOCAL_STORAGE_KEY } from './api';

const songs = [4, 9, 18].map(id => ({ id, local_song_id: `manual-${id}`, anime_name: 'Anime', anime_year: 2020, song_name: `Song ${id}`, artist: 'Artist' }));
function memory() {
  const data = new Map([[LOCAL_STORAGE_KEY, JSON.stringify(songs)], ['notes', 'keep']]);
  return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
}
test('saved Undo preserves identities, order, unrelated edits and notes', () => {
  const storage = memory();
  const { removed } = removeSavedSong(9, storage);
  const current = JSON.parse(storage.getItem(LOCAL_STORAGE_KEY)!);
  current[0].artist = 'Edited';
  current.push({ ...songs[0], id: 22, local_song_id: 'new' });
  storage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(current));
  const restored = restoreSavedSong(removed, storage);
  assert.deepEqual(restored.map(song => song.id), [4, 9, 18, 22]);
  assert.deepEqual(restored[1], songs[1]);
  assert.equal(restored[0].artist, 'Edited');
  assert.equal(storage.data.get('notes'), 'keep');
  assert.deepEqual(restoreSavedSong(removed, storage), restored);
});
test('failed removal/Undo and corrupt storage never overwrite data; Undo can retry', () => {
  const storage = memory();
  const failing = { ...storage, setItem: () => { throw new Error('Quota'); } };
  assert.throws(() => removeSavedSong(9, failing), /Could not save/);
  assert.deepEqual(JSON.parse(storage.getItem(LOCAL_STORAGE_KEY)!), songs);
  const { removed } = removeSavedSong(9, storage);
  const before = storage.getItem(LOCAL_STORAGE_KEY);
  assert.throws(() => restoreSavedSong(removed, failing), /Could not save/);
  assert.equal(storage.getItem(LOCAL_STORAGE_KEY), before);
  assert.deepEqual(restoreSavedSong(removed, storage), songs);
  storage.setItem(LOCAL_STORAGE_KEY, 'broken');
  assert.throws(() => restoreSavedSong(removed, storage), /Could not read/);
  assert.equal(storage.getItem(LOCAL_STORAGE_KEY), 'broken');
});
test('Undo refuses reused saved IDs and duplicate identities', () => {
  const storage = memory();
  const { removed } = removeSavedSong(18, storage);
  storage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([...songs.slice(0, 2), { ...songs[2], song_name: 'Different' }]));
  assert.throws(() => restoreSavedSong(removed, storage), /another song/);
  storage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([...songs.slice(0, 2), { ...songs[2], id: 25 }]));
  assert.throws(() => restoreSavedSong(removed, storage), /saved again/);
});
test('playlist Undo restores only membership with snapshot and order, including storage retry', () => {
  const storage = memory();
  const refs = songs.map(song => ({ songId: song.local_song_id, source: 'local' as const, snapshot: song }));
  const [list] = changePlaylists({ type: 'create', name: 'First' }, storage);
  for (const song of refs) changePlaylists({ type: 'addSong', id: list.id, song }, storage);
  changePlaylists({ type: 'create', name: 'Other', song: refs[1] }, storage);
  const removed = { item: refs[1], order: refs.map(songReferenceKey) };
  changePlaylists({ type: 'removeSong', id: list.id, songKey: songReferenceKey(refs[1]) }, storage);
  changePlaylists({ type: 'rename', id: list.id, name: 'Renamed' }, storage);
  const undo = { type: 'restoreSong' as const, id: list.id, removed };
  assert.throws(() => changePlaylists(undo, { ...storage, setItem: () => { throw new Error(); } }), /Could not save/);
  assert.equal(loadPlaylists(storage)[0].songs.length, 2);
  const restored = changePlaylists(undo, storage);
  assert.deepEqual(restored[0].songs, refs);
  assert.equal(restored[0].name, 'Renamed');
  assert.deepEqual(restored[1].songs, [refs[1]]);
  assert.deepEqual(changePlaylists(undo, storage), restored);
  assert.equal(storage.getItem(LOCAL_STORAGE_KEY), JSON.stringify(songs));
  changePlaylists({ type: 'delete', id: list.id }, storage);
  assert.throws(() => changePlaylists(undo, storage), /no longer exists/);
});

test('bulk playlist Undo restores exact lists and order atomically while preserving new lists', () => {
  const storage = memory();
  for (const name of ['First', 'Middle', 'Last']) changePlaylists({ type: 'create', name }, storage);
  const before = loadPlaylists(storage);
  changePlaylists({ type: 'addSong', id: before[0].id, song: { source: 'local', songId: 'manual-4', snapshot: songs[0] } }, storage);
  const original = loadPlaylists(storage);
  changePlaylists({ type: 'deleteMany', ids: [original[0].id, original[2].id] }, storage);
  const latest = changePlaylists({ type: 'create', name: 'New' }, storage);
  const restore = { type: 'restoreLists' as const, removed: [original[0], original[2]], order: original.map(list => list.id) };
  assert.throws(() => changePlaylists(restore, { ...storage, setItem: () => { throw new Error(); } }), /Could not save/);
  assert.deepEqual(loadPlaylists(storage), latest);
  const restored = changePlaylists(restore, storage);
  assert.deepEqual(restored, [...original, latest[1]]);
  assert.deepEqual(changePlaylists(restore, storage), restored);
  assert.equal(storage.getItem(LOCAL_STORAGE_KEY), JSON.stringify(songs));
});

test('playlist Undo refuses name and identity conflicts without partial restoration', () => {
  const storage = memory();
  changePlaylists({ type: 'create', name: 'First' }, storage);
  const original = changePlaylists({ type: 'create', name: 'Second' }, storage);
  changePlaylists({ type: 'deleteMany', ids: original.map(list => list.id) }, storage);
  const latest = changePlaylists({ type: 'create', name: 'Second' }, storage);
  const restore = { type: 'restoreLists' as const, removed: original, order: original.map(list => list.id) };
  assert.throws(() => changePlaylists(restore, storage), /already exists/);
  assert.deepEqual(loadPlaylists(storage), latest);
  changePlaylists({ type: 'delete', id: latest[0].id }, storage);
  changePlaylists(restore, storage);
  changePlaylists({ type: 'rename', id: original[0].id, name: 'Changed' }, storage);
  assert.throws(() => changePlaylists(restore, storage), /ID is now in use/);
});
