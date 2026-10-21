import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ensureLocalSongIdentity,
  clearLocalEntries,
  createEntry,
  deleteEntry,
  fetchEntries,
  getLocalEntries,
  importEntries,
  resetEntriesToDefault,
  saveLocalEntries,
  updateEntry,
} from './api';
import { AnimeSongEntry } from '../types';
import { getAnnSongId, mapAnisongDbSong, searchSongsByArtistIds } from './anisongdbArtists';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

test('collection operations use only localStorage and never call the server API', async () => {
  const originalStorage = globalThis.localStorage;
  const originalFetch = globalThis.fetch;
  const storage = new MemoryStorage();
  let fetchCalls = 0;

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ data: [{ id: 999 }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  const entries: AnimeSongEntry[] = [
    {
      id: 1,
      anime_name: 'Delete Me',
      anime_year: 2026,
      artist: 'Test Artist',
      song_name: 'Temporary Song',
    },
    {
      id: 2,
      anime_name: 'Keep Me',
      anime_year: 2025,
      artist: 'Test Artist',
      song_name: 'Persistent Song',
    },
  ];

  try {
    assert.deepEqual(await fetchEntries(), [], 'a fresh browser starts with an empty collection');
    saveLocalEntries(entries);
    assert.deepEqual(await fetchEntries(), entries);

    const created = await createEntry({
      anime_name: 'Created Locally',
      anime_year: 2026,
      artist: 'Local Artist',
      song_name: 'Local Song',
    });
    assert.equal(created.id, 3);

    const updated = await updateEntry(created.id, { song_name: 'Updated Locally' });
    assert.equal(updated.song_name, 'Updated Locally');

    await deleteEntry(1);
    assert.deepEqual(getLocalEntries(), [entries[1], updated]);

    const imported = [entries[0]];
    assert.deepEqual(await importEntries(imported), imported);
    assert.deepEqual(getLocalEntries(), imported);

    assert.deepEqual(await resetEntriesToDefault(), []);
    assert.deepEqual(getLocalEntries(), []);

    assert.equal(fetchCalls, 0);
  } finally {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: originalStorage,
    });
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: originalFetch,
    });
  }
});

test('failed save, add, edit, import and reset reject without changing persisted songs or notes', async () => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  const original = { id: 1, anime_name: 'Original anime', anime_year: 2021, artist: 'Artist', song_name: 'Original song' };
  try {
    saveLocalEntries([original]);
    storage.setItem('anime_song_notes_v1', 'Existing private notes');
    const before = storage.getItem('anime_songs_db_v1');
    storage.setItem = () => { throw new Error('QuotaExceededError'); };
    assert.throws(() => saveLocalEntries([]), /Could not save Saved Songs/);
    assert.throws(() => clearLocalEntries(), /Could not save Saved Songs/);
    const { id, ...newSong } = original;
    for (const action of [
      () => createEntry(newSong),
      () => updateEntry(id, { song_name: 'Unsaved change' }),
      () => importEntries([]),
      () => resetEntriesToDefault(),
    ]) {
      await assert.rejects(action, /Could not save Saved Songs/);
      assert.equal(storage.getItem('anime_songs_db_v1'), before);
      assert.equal(storage.getItem('anime_song_notes_v1'), 'Existing private notes');
    }
    assert.deepEqual(await fetchEntries(), [original]);
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('catalog song IDs map to AnisongDB ANN song IDs', () => {
  assert.equal(getAnnSongId('song-47505'), 47505);
  assert.equal(getAnnSongId(47505), 47505);
  assert.equal(getAnnSongId('not-a-song'), null);
});

test('removal preserves saved IDs, order and notes, and rejects failed storage writes', async () => {
  const originalStorage = globalThis.localStorage;
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  const entries: AnimeSongEntry[] = [2, 7, 12].map((id) => ({
    id, anime_name: 'Test Anime', anime_year: 2021, artist: 'Test Artist', song_name: `Song ${id}`,
  }));
  const noteBackup = JSON.stringify({ version: 1, notes: { 'collection:7': { text: 'Keep this note' } } });
  try {
    saveLocalEntries(entries);
    storage.setItem('anime_song_notes_v1', noteBackup);
    await deleteEntry(7);
    assert.deepEqual(await fetchEntries(), [entries[0], entries[2]]);
    assert.equal(storage.getItem('anime_song_notes_v1'), noteBackup);

    storage.setItem = () => { throw new Error('Storage blocked'); };
    await assert.rejects(deleteEntry(2), /Storage blocked/);
    assert.deepEqual(await fetchEntries(), [entries[0], entries[2]]);
    assert.equal(storage.getItem('anime_song_notes_v1'), noteBackup);
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: originalStorage });
  }
});

test('AnisongDB songs retain canonical artist IDs and group relationships', () => {
  const mapped = mapAnisongDbSong({
    annSongId: 47505,
    animeENName: 'Test Anime',
    animeVintage: 'Winter 2026',
    songType: 'Opening 1',
    songName: 'Test Song',
    songArtist: 'Test Group',
    linked_ids: { anilist: 123 },
    HQ: 'video.webm',
    artists: [
      {
        id: 10,
        names: ['Test Group'],
        line_up_id: 0,
        members: [{ id: 11, names: ['Test Member'], line_up_id: -1 }],
      },
    ],
  });

  assert.equal(mapped?.id, 'song-47505');
  assert.equal(mapped?.artists?.[0].id, 10);
  assert.equal(mapped?.artists?.[0].members?.[0].id, 11);
  assert.equal(mapped?.video_url, 'https://naedist.animemusicquiz.com/video.webm');
});

test('artist clicks query by unique numeric IDs instead of artist text', async () => {
  const originalFetch = globalThis.fetch;
  let submittedBody: Record<string, unknown> | null = null;

  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async (input: string | URL | Request, init?: RequestInit) => {
      assert.equal(String(input), 'https://anisongdb.com/api/artist_ids_request');
      submittedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify([
        {
          annSongId: 47505,
          animeENName: 'Group Anime',
          animeVintage: 'Winter 2026',
          songType: 'Opening 1',
          songName: 'Group Song',
          songArtist: 'Test Group',
          linked_ids: {},
          artists: [{ id: 10, names: ['Test Group'], members: [{ id: 11, names: ['Test Member'] }] }],
        },
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });

  try {
    const result = await searchSongsByArtistIds([11, 11], { themeType: 'OP' });
    assert.deepEqual(submittedBody, {
      artist_ids: [11],
      group_granularity: 0,
      max_other_artist: 99,
    });
    assert.equal(result.total, 1);
    assert.equal(result.data[0].artist, 'Test Group');
  } finally {
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: originalFetch,
    });
  }
});


test('legacy manual song identity persists without renumbering; recycled saved IDs receive new identity', async () => {
  const originalStorage = globalThis.localStorage;
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try {
    const song = { id: 17, anime_name: 'Manual anime', anime_year: 2020, artist: 'Artist', song_name: 'Manual song' };
    storage.setItem('anime_songs_db_v1', JSON.stringify([song]));
    const identified = ensureLocalSongIdentity(song);
    assert.equal(identified.id, 17);
    assert.ok(identified.local_song_id);
    assert.equal(ensureLocalSongIdentity(song).local_song_id, identified.local_song_id);
    assert.equal(getLocalEntries()[0].local_song_id, identified.local_song_id);
    await deleteEntry(17);
    storage.setItem('anime_songs_db_v1', JSON.stringify([song]));
    assert.notEqual(ensureLocalSongIdentity(song).local_song_id, identified.local_song_id);
    storage.setItem('anime_songs_db_v1', JSON.stringify([song]));
    storage.setItem = () => { throw new Error('Storage full'); };
    assert.throws(() => ensureLocalSongIdentity(song), /Storage full/);
    assert.equal(getLocalEntries()[0].local_song_id, undefined);
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: originalStorage });
  }
});
