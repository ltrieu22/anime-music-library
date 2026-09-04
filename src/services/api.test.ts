import assert from 'node:assert/strict';
import test from 'node:test';
import { deleteEntry, getLocalEntries, saveLocalEntries } from './api';
import { AnimeSongEntry } from '../types';

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
