import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PLAYER_VOLUME_DEFAULT,
  PLAYER_VOLUME_SCHEMA_VERSION,
  PLAYER_VOLUME_STORAGE_KEY,
  readStoredPlayerVolume,
  sanitizePlayerVolume,
  writeStoredPlayerVolume,
} from './playerVolume';

interface MemoryStorageOptions {
  failSet?: boolean;
}

function installMemoryStorage(
  entries: Record<string, string> = {},
  options: MemoryStorageOptions = {}
): Storage {
  const backing = new Map<string, string>(Object.entries(entries));
  const storage = {
    getItem: (key: string) => (backing.has(key) ? backing.get(key)! : null),
    setItem: (key: string, value: string) => {
      if (options.failSet) throw new Error('QuotaExceededError');
      backing.set(key, value);
    },
    removeItem: (key: string) => {
      backing.delete(key);
    },
    clear: () => backing.clear(),
    key: (index: number) => [...backing.keys()][index] ?? null,
    get length() {
      return backing.size;
    },
  };
  (globalThis as { localStorage?: Storage }).localStorage = storage;
  return storage;
}

function installStoredVolume(payload: string) {
  return installMemoryStorage({ [PLAYER_VOLUME_STORAGE_KEY]: payload });
}

function storeVolume(value: unknown) {
  return installStoredVolume(
    JSON.stringify({ version: PLAYER_VOLUME_SCHEMA_VERSION, volume: value })
  );
}

test('missing preference or unavailable storage falls back to the 40% default', () => {
  assert.equal(PLAYER_VOLUME_DEFAULT, 0.4);
  installMemoryStorage();
  assert.equal(readStoredPlayerVolume(), 0.4);

  const previous = (globalThis as { localStorage?: Storage }).localStorage;
  try {
    (globalThis as { localStorage?: Storage }).localStorage = undefined;
    assert.equal(readStoredPlayerVolume(), 0.4);
    assert.equal(writeStoredPlayerVolume(0.4), false);
  } finally {
    (globalThis as { localStorage?: Storage }).localStorage = previous;
  }
});

test('corrupted, malformed, or unsupported payloads fall back without clearing storage', () => {
  const raws = [
    'not json',
    '123',
    '"volume"',
    'null',
    '[]',
    '{}',
    '{"version":99,"volume":0.5}',
    '{"volume":0.5}',
    '{"version":1,"volume":"0.5"}',
    '{"version":1,"volume":null}',
    '{"version":1,"volume":true}',
    '{"version":1,"volume":[0.5]}',
  ];
  for (const raw of raws) {
    const storage = installStoredVolume(raw);
    assert.equal(readStoredPlayerVolume(), 0.4, `fallback for ${raw}`);
    assert.equal(storage.getItem(PLAYER_VOLUME_STORAGE_KEY), raw, `raw preserved for ${raw}`);
  }
});

test('valid stored volumes are preserved, including a valid zero', () => {
  for (const volume of [0, 0.05, 0.4, 0.73, 1]) {
    installMemoryStorage({});
    assert.equal(writeStoredPlayerVolume(volume), true, `write ${volume}`);
    assert.equal(readStoredPlayerVolume(), volume, `round-trip ${volume}`);
  }
  assert.equal(storeVolume(0.31).getItem(PLAYER_VOLUME_STORAGE_KEY), JSON.stringify({ version: PLAYER_VOLUME_SCHEMA_VERSION, volume: 0.31 }));
  assert.equal(readStoredPlayerVolume(), 0.31);
});

test('finite out-of-range values clamp into [0, 1]; non-finite values fall back', () => {
  installStoredVolume(JSON.stringify({ version: PLAYER_VOLUME_SCHEMA_VERSION, volume: 1.5 }));
  assert.equal(readStoredPlayerVolume(), 1);
  installStoredVolume(JSON.stringify({ version: PLAYER_VOLUME_SCHEMA_VERSION, volume: -0.2 }));
  assert.equal(readStoredPlayerVolume(), 0);
  // JSON.stringify serializes NaN/Infinity as null, which must not crash the reader.
  installStoredVolume(JSON.stringify({ version: PLAYER_VOLUME_SCHEMA_VERSION, volume: Number.NaN }));
  assert.equal(readStoredPlayerVolume(), 0.4);
  installStoredVolume(JSON.stringify({ version: PLAYER_VOLUME_SCHEMA_VERSION, volume: Number.POSITIVE_INFINITY }));
  assert.equal(readStoredPlayerVolume(), 0.4);
});

test('writes round-trip the versioned payload and report unavailable storage', () => {
  const storage = installMemoryStorage();
  assert.equal(writeStoredPlayerVolume(0.73), true);
  assert.equal(
    storage.getItem(PLAYER_VOLUME_STORAGE_KEY),
    JSON.stringify({ version: PLAYER_VOLUME_SCHEMA_VERSION, volume: 0.73 })
  );
  assert.equal(readStoredPlayerVolume(), 0.73);

  const failing = installMemoryStorage({}, { failSet: true });
  assert.equal(writeStoredPlayerVolume(0.5), false);
  assert.equal(failing.getItem(PLAYER_VOLUME_STORAGE_KEY), null);
  assert.equal(readStoredPlayerVolume(), 0.4);
  assert.equal(writeStoredPlayerVolume(Number.NaN), false);
});

test('sanitizer clamps finite input and rejects non-finite or non-numeric input', () => {
  assert.equal(sanitizePlayerVolume(0.4), 0.4);
  assert.equal(sanitizePlayerVolume(0), 0);
  assert.equal(sanitizePlayerVolume(1), 1);
  assert.equal(sanitizePlayerVolume(1.5), 1);
  assert.equal(sanitizePlayerVolume(-1), 0);
  assert.equal(sanitizePlayerVolume(Number.NaN), null);
  assert.equal(sanitizePlayerVolume(Number.POSITIVE_INFINITY), null);
  assert.equal(sanitizePlayerVolume('0.4'), null);
  assert.equal(sanitizePlayerVolume(null), null);
  assert.equal(sanitizePlayerVolume(undefined), null);
  assert.equal(sanitizePlayerVolume({}), null);
});
