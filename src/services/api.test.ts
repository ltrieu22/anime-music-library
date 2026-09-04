import assert from 'node:assert/strict';
import test from 'node:test';
import { deleteEntry, getLocalEntries, saveLocalEntries } from './api';
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

test('deleteEntry removes only the selected local collection item when the API is unavailable', async () => {
  const originalStorage = globalThis.localStorage;
  const originalFetch = globalThis.fetch;
  const storage = new MemoryStorage();

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async () => new Response(null, { status: 404 }),
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
    saveLocalEntries(entries);
    await deleteEntry(1);

    assert.deepEqual(getLocalEntries(), [entries[1]]);
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

test('catalog song IDs map to AnisongDB ANN song IDs', () => {
  assert.equal(getAnnSongId('song-47505'), 47505);
  assert.equal(getAnnSongId(47505), 47505);
  assert.equal(getAnnSongId('not-a-song'), null);
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
