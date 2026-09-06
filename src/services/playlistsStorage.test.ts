import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changePlaylists, createSongReference, loadPlaylists, PLAYLISTS_STORAGE_KEY, SAVED_SONGS_ID, songReferenceKey, resolvePlaylistSong } from './playlistsStorage';
import type { AnimeSongEntry } from '../types';

function memoryStorage() {
  const data = new Map<string, string>([['anime_songs_db_v1', '[{"id":17}]'], ['anime-db:notes', 'personal notes']]);
  return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
}

test('legacy browser starts with no custom lists; create, rename and delete persist without touching existing data', () => {
  const storage = memoryStorage();
  assert.deepEqual(loadPlaylists(storage), []);
  assert.equal(storage.getItem(PLAYLISTS_STORAGE_KEY), null);
  const [first] = changePlaylists({ type: 'create', name: '  Favorites  ' }, storage);
  assert.equal(first.name, 'Favorites');
  assert.deepEqual(first.songs, []);
  const lists = changePlaylists({ type: 'create', name: '夜の音楽' }, storage);
  assert.notEqual(lists[0].id, lists[1].id);
  changePlaylists({ type: 'rename', id: first.id, name: 'Evening' }, storage);
  assert.equal(loadPlaylists(storage)[0].id, first.id);
  assert.equal(loadPlaylists(storage)[0].name, 'Evening');
  changePlaylists({ type: 'delete', id: first.id }, storage);
  assert.deepEqual(loadPlaylists(storage), [lists[1]]);
  assert.equal(storage.getItem('anime_songs_db_v1'), '[{"id":17}]');
  assert.equal(storage.getItem('anime-db:notes'), 'personal notes');
});

test('blank, duplicate, reserved and long names cannot change storage; Saved Songs is protected', () => {
  const storage = memoryStorage();
  const [first] = changePlaylists({ type: 'create', name: 'Favorites' }, storage);
  const before = storage.getItem(PLAYLISTS_STORAGE_KEY);
  for (const name of ['', '   ', 'FAVORITES', ' saved songs ', 'x'.repeat(81)]) {
    assert.throws(() => changePlaylists({ type: 'create', name }, storage));
    assert.equal(storage.getItem(PLAYLISTS_STORAGE_KEY), before);
  }
  assert.doesNotThrow(() => changePlaylists({ type: 'rename', id: first.id, name: 'FAVORITES' }, storage));
  assert.throws(() => changePlaylists({ type: 'delete', id: SAVED_SONGS_ID }, storage));
  assert.throws(() => changePlaylists({ type: 'rename', id: SAVED_SONGS_ID, name: 'Other' }, storage));
});

test('unreadable, invalid, and future storage is preserved instead of overwritten', () => {
  const storage = memoryStorage();
  for (const raw of ['not json', '{}', '{"version":2,"playlists":[]}', '{"version":1,"playlists":[{"id":"saved-songs","name":"Custom","songs":[]}]}']) {
    storage.setItem(PLAYLISTS_STORAGE_KEY, raw);
    assert.throws(() => loadPlaylists(storage));
    assert.throws(() => changePlaylists({ type: 'create', name: 'New' }, storage));
    assert.equal(storage.getItem(PLAYLISTS_STORAGE_KEY), raw);
  }
  assert.throws(() => loadPlaylists({ ...storage, getItem: () => { throw new Error(); } }), /Could not read/);
});

test('failed writes surface errors and preserve last persisted state', () => {
  const storage = memoryStorage();
  const [first] = changePlaylists({ type: 'create', name: 'First' }, storage);
  const failing = { ...storage, setItem: () => { throw new Error('Quota exceeded'); } };
  assert.throws(() => changePlaylists({ type: 'create', name: 'Second' }, failing), /Could not save/);
  assert.throws(() => changePlaylists({ type: 'rename', id: first.id, name: 'Renamed' }, failing), /Could not save/);
  assert.throws(() => changePlaylists({ type: 'delete', id: first.id }, failing), /Could not save/);
  assert.deepEqual(loadPlaylists(storage), [first]);
});

test('mutations read current storage and stale deleted IDs cannot recreate a playlist', () => {
  const storage = memoryStorage();
  const [first] = changePlaylists({ type: 'create', name: 'First' }, storage);
  changePlaylists({ type: 'create', name: 'From another tab' }, storage);
  assert.equal(changePlaylists({ type: 'rename', id: first.id, name: 'Renamed' }, storage).length, 2);
  changePlaylists({ type: 'delete', id: first.id }, storage);
  assert.throws(() => changePlaylists({ type: 'rename', id: first.id, name: 'Resurrected' }, storage), /no longer exists/);
});

test('song references outlive saved entries and keep bilingual metadata and media independently', () => {
  const song: AnimeSongEntry = { id: 17, source_song_id: 'song-34830', anime_name: 'The Heike Story', anime_name_romaji: 'Heike Monogatari', anime_alt_names: ['Heike'], anime_year: 2021, artist: 'Hitsujibungaku', song_name: 'Hikaru Toki', audio_url: 'https://example.com/audio.ogg' };
  const reference = createSongReference(song);
  assert.equal(reference.songId, 'song-34830');
  assert.equal(reference.source, 'anisongdb');
  song.anime_alt_names!.push('Changed');
  assert.deepEqual(reference.snapshot?.anime_alt_names, ['Heike']);
  const { source_song_id, ...manual } = song;
  const local = createSongReference(manual);
  assert.equal(local.source, 'local');
  assert.notEqual(local.songId, String(manual.id));
  assert.notEqual(createSongReference(manual).songId, local.songId);
  assert.equal(createSongReference({ ...manual, source: 'anisongdb' }).source, 'anisongdb');
  const storage = memoryStorage();
  storage.setItem(PLAYLISTS_STORAGE_KEY, JSON.stringify({ version: 1, playlists: [{ id: 'playlist-test', name: 'References', songs: [reference, local] }] }));
  storage.setItem('anime_songs_db_v1', '[]');
  changePlaylists({ type: 'rename', id: 'playlist-test', name: 'Renamed' }, storage);
  assert.deepEqual(loadPlaylists(storage)[0].songs, [reference, local]);
  assert.equal(loadPlaylists(storage)[0].songs[0].snapshot?.audio_url, song.audio_url);
});


test('membership, ordering and removal are independent across lists and repeated adds are idempotent', () => {
  const storage = memoryStorage();
  const [a] = changePlaylists({ type: 'create', name: 'A' }, storage);
  const [, b] = changePlaylists({ type: 'create', name: 'B' }, storage);
  const one = createSongReference({ id: 'song-1', anime_name: 'Anime', anime_year: 2021, artist: 'Artist', song_name: 'One', audio_url: 'https://example.com/one.ogg' });
  const two = createSongReference({ id: 'song-2', anime_name: 'Anime', anime_year: 2021, artist: 'Artist', song_name: 'Two' });
  for (const id of [a.id, b.id]) changePlaylists({ type: 'addSong', id, song: one }, storage);
  changePlaylists({ type: 'addSong', id: a.id, song: two }, storage);
  changePlaylists({ type: 'addSong', id: a.id, song: one }, storage);
  assert.equal(loadPlaylists(storage)[0].songs.length, 2);
  changePlaylists({ type: 'moveSong', id: a.id, songKey: songReferenceKey(two), direction: -1 }, storage);
  assert.deepEqual(loadPlaylists(storage)[0].songs, [two, one]);
  assert.deepEqual(loadPlaylists(storage)[1].songs, [one]);
  changePlaylists({ type: 'removeSong', id: a.id, songKey: songReferenceKey(one) }, storage);
  assert.deepEqual(loadPlaylists(storage)[0].songs, [two]);
  assert.deepEqual(loadPlaylists(storage)[1].songs, [one]);
  assert.equal(storage.getItem('anime_songs_db_v1'), '[{"id":17}]');
  assert.equal(storage.getItem('anime-db:notes'), 'personal notes');
  changePlaylists({ type: 'delete', id: a.id }, storage);
  assert.deepEqual(loadPlaylists(storage)[0].songs, [one]);
});

test('membership edits preserve persisted state on failures and reject stale songs', () => {
  const storage = memoryStorage();
  const [list] = changePlaylists({ type: 'create', name: 'List' }, storage);
  const song = createSongReference({ id: 'song-1', anime_name: 'Anime', anime_year: 2021, artist: 'Artist', song_name: 'One' });
  changePlaylists({ type: 'addSong', id: list.id, song }, storage);
  const before = storage.getItem(PLAYLISTS_STORAGE_KEY);
  const failing = { ...storage, setItem: () => { throw new Error('Quota exceeded'); } };
  assert.throws(() => changePlaylists({ type: 'removeSong', id: list.id, songKey: songReferenceKey(song) }, failing), /Could not save/);
  assert.equal(storage.getItem(PLAYLISTS_STORAGE_KEY), before);
  assert.throws(() => changePlaylists({ type: 'moveSong', id: list.id, songKey: 'missing', direction: 1 }, storage), /no longer/);
  changePlaylists({ type: 'moveSong', id: list.id, songKey: songReferenceKey(song), direction: -1 }, storage);
  assert.equal(storage.getItem(PLAYLISTS_STORAGE_KEY), before);
});

test('catalog resolution uses exact identity; missing songs retain snapshots and stable manual IDs are reused', () => {
  const song = { id: 5, source_song_id: 'song-1', anime_name: 'Old title', anime_year: 2021, artist: 'Artist', song_name: 'One', audio_url: 'https://example.com/audio.ogg' };
  const ref = createSongReference(song);
  assert.equal(ref.snapshot?.id, 'song-1');
  assert.equal(ref.snapshot?.source, 'anisongdb');
  const exact = { ...song, id: 'song-1', anime_name_romaji: 'Romaji' };
  assert.equal(resolvePlaylistSong(ref, [exact]).anime_name_romaji, 'Romaji');
  assert.equal(resolvePlaylistSong(ref, [{ ...exact, id: 'song-other', song_name: 'Same title is not identity' }]).song_name, 'One');
  assert.equal(resolvePlaylistSong(ref, []).audio_url, song.audio_url);
  assert.match(resolvePlaylistSong({ source: 'anisongdb', songId: 'missing' }, []).song_name, /Unavailable/);
  const { source_song_id, ...manual } = song;
  const identified = { ...manual, local_song_id: 'manual-uuid' };
  assert.equal(createSongReference(identified).songId, createSongReference({ ...identified, song_name: 'Edited' }).songId);
  assert.equal(resolvePlaylistSong(createSongReference(identified), []).id, manual.id);
});
