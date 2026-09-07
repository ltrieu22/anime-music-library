import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDataBackup, parseDataBackup, persistBackupImport } from './dataBackup';
import { LOCAL_STORAGE_KEY } from './api';
import { NOTES_STORAGE_KEY, createNoteSongSnapshot, findNoteForSong } from './notesStorage';
import { loadPlaylists, changePlaylists, resolvePlaylistSong, songReferenceKey, type CustomPlaylist } from './playlistsStorage';
import type { AnimeSongEntry } from '../types';
import { toSongTrack } from '../utils/player';

const song: AnimeSongEntry = {
  id: 17, local_song_id: 'manual-stable-id', anime_name: 'Legacy title', anime_year: 2021,
  anime_name_english: 'English title', anime_name_romaji: 'Romaji title', anime_alt_names: ['日本語', 'Alternate'],
  artist: 'Artist', song_name: 'Manual song', audio_url: 'https://example.com/song.mp3', theme_type: 'Opening 1',
};
const snapshot = createNoteSongSnapshot(song);
const local = { songId: song.local_song_id!, source: 'local' as const, snapshot };
const missing = { songId: 'missing-catalog-id', source: 'anisongdb' as const };
const lists: CustomPlaylist[] = [
  { id: 'second', name: '夜の音楽', songs: [missing, local] },
  { id: 'first', name: 'First', songs: [local] },
  { id: 'empty', name: 'Empty', songs: [] },
];
const notes = { 'collection:17': { songKey: 'collection:17', song: snapshot, text: 'Keep this note', updatedAt: '2026-09-07T00:00:00.000Z' } };
const backup = () => {
  const { local_song_id, ...catalogSong } = song;
  return createDataBackup([song, { ...catalogSong, id: 42, source_song_id: 'catalog-42' }], notes, lists);
};
function memoryStorage() {
  const data = new Map<string, string>();
  return { data, getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); } };
}

test('v2 JSON round trip restores saved IDs, bilingual metadata, notes, playlist identities and all ordering', () => {
  const exported = backup();
  const parsed = parseDataBackup(JSON.parse(JSON.stringify(exported)));
  assert.deepEqual(parsed.entries, exported.entries);
  assert.deepEqual(parsed.notes, notes);
  assert.deepEqual(parsed.playlists, lists);
  const storage = memoryStorage();
  persistBackupImport(parsed, storage);
  const reopened = { ...storage }; // New consumer of persisted bytes.
  assert.deepEqual(JSON.parse(reopened.getItem(LOCAL_STORAGE_KEY)!), exported.entries);
  assert.deepEqual(JSON.parse(reopened.getItem(NOTES_STORAGE_KEY)!).notes, notes);
  assert.deepEqual(loadPlaylists(reopened), lists);
  assert.deepEqual(createDataBackup(parsed.entries, parsed.notes!, loadPlaylists(reopened)), exported);
  persistBackupImport(parsed, reopened);
  assert.deepEqual(loadPlaylists(reopened), lists, 'repeat import replaces without duplicating');
  assert.equal(findNoteForSong(parsed.notes!, parsed.entries[0])?.text, 'Keep this note');
});

test('restored missing references remain visible and snapshots play without catalog or Saved Songs', () => {
  const parsed = parseDataBackup(backup());
  const refs = parsed.playlists![0].songs;
  const unknown = resolvePlaylistSong(refs[0], []);
  assert.match(unknown.song_name, /Unavailable song/);
  assert.equal(toSongTrack(unknown, 'collection'), null);
  const resolved = resolvePlaylistSong(refs[1], []);
  assert.deepEqual(resolved, snapshot);
  assert.equal(toSongTrack(resolved, 'collection')?.videoUrl, song.audio_url);
  assert.deepEqual(resolved.anime_alt_names, song.anime_alt_names);
});

test('deleting restored playlist membership and a playlist leaves other lists, Saved Songs and notes intact', () => {
  const storage = memoryStorage();
  persistBackupImport(parseDataBackup(backup()), storage);
  const saved = storage.getItem(LOCAL_STORAGE_KEY);
  const savedNotes = storage.getItem(NOTES_STORAGE_KEY);
  changePlaylists({ type: 'removeSong', id: 'second', songKey: songReferenceKey(local) }, storage);
  assert.deepEqual(loadPlaylists(storage)[1], lists[1]);
  changePlaylists({ type: 'delete', id: 'second' }, storage);
  assert.deepEqual(loadPlaylists(storage), lists.slice(1));
  assert.equal(storage.getItem(LOCAL_STORAGE_KEY), saved);
  assert.equal(storage.getItem(NOTES_STORAGE_KEY), savedNotes);
});

test('legacy v1 and raw-array imports preserve omitted sections byte for byte; explicit empty v2 clears sections', () => {
  const storage = memoryStorage();
  persistBackupImport(parseDataBackup(backup()), storage);
  const prior = new Map(storage.data);
  const v1 = parseDataBackup({ version: 1, entries: [song], notes: {} });
  assert.equal(v1.playlists, undefined);
  persistBackupImport(v1, storage);
  assert.deepEqual(loadPlaylists(storage), lists);
  const raw = parseDataBackup([]);
  assert.equal(raw.notes, undefined);
  assert.equal(raw.playlists, undefined);
  storage.setItem(NOTES_STORAGE_KEY, prior.get(NOTES_STORAGE_KEY)!);
  persistBackupImport(raw, storage);
  assert.equal(storage.getItem(NOTES_STORAGE_KEY), prior.get(NOTES_STORAGE_KEY));
  assert.deepEqual(loadPlaylists(storage), lists);
  persistBackupImport(parseDataBackup({ version: 2, entries: [], notes: {}, playlists: [] }), storage);
  assert.deepEqual(loadPlaylists(storage), []);
  assert.deepEqual(JSON.parse(storage.getItem(NOTES_STORAGE_KEY)!).notes, {});
});

test('malformed/future backups, duplicate identities and invalid snapshots are rejected before persistence', () => {
  for (const value of [null, {}, { ...backup(), version: 3 }, { ...backup(), playlists: undefined },
    { ...backup(), entries: [song, song] }, { ...backup(), playlists: [lists[0], lists[0]] },
    ...[
      { ...lists[0], id: 'saved-songs' }, { ...lists[0], name: ' Saved Songs ' },
      { ...lists[0], songs: [local, local] }, { ...lists[0], songs: [{ ...local, snapshot: undefined }] },
      { ...lists[0], songs: [{ ...local, snapshot: { ...snapshot, audio_url: {} } }] },
      { ...lists[0], songs: [{ ...local, snapshot: { ...snapshot, anime_alt_names: [42] } }] },
    ].map((playlist) => ({ ...backup(), playlists: [playlist] })),
  ]) assert.throws(() => parseDataBackup(value));
  const partial = parseDataBackup({ version: 1, entries: [null, song], notes: { bad: {} } });
  assert.equal(partial.skippedEntries, 1);
  assert.equal(partial.skippedNotes, 1);
});

test('each failed storage write rolls back all completed writes, including previously absent keys', () => {
  for (const existing of [false, true]) for (const failure of [1, 2, 3]) {
    const storage = memoryStorage();
    if (existing) persistBackupImport(parseDataBackup({ ...backup(), entries: [], notes: {} }), storage);
    const before = new Map(storage.data);
    let count = 0;
    const failing = { ...storage, setItem: (key: string, value: string) => {
      if (++count === failure) throw new Error('Quota exceeded');
      storage.setItem(key, value);
    } };
    assert.throws(() => persistBackupImport(parseDataBackup(backup()), failing), /Existing data was restored/);
    assert.deepEqual(storage.data, before);
  }
});

test('read failures never write and rollback failures clearly report partial recovery', () => {
  const storage = memoryStorage();
  assert.throws(() => persistBackupImport(parseDataBackup(backup()), { ...storage, getItem: () => { throw new Error('Blocked'); } }), /Blocked/);
  assert.equal(storage.data.size, 0);
  let count = 0;
  assert.throws(() => persistBackupImport(parseDataBackup(backup()), {
    ...storage, setItem: (key, value) => { if (++count > 1) throw new Error(); storage.setItem(key, value); },
    removeItem: () => { throw new Error(); },
  }), /some previous data could not be restored/);
});
