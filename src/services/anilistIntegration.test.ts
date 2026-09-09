import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchAnimeCoverDetails, fetchAnimeCoverUrl, searchAnime } from './api';
import { createAnimeDetailsCache } from './animeDetailsCache';

test('artwork callers share cached details and never bypass a failed proxy', async () => {
  const originalFetch = globalThis.fetch;
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  let calls = 0;
  let mode = 'success';
  const detail = { id: 123, anime: 'Example', coverImage: 'https://example.test/cover.jpg', genres: ['Music'] };
  globalThis.fetch = async input => {
    calls++;
    assert.ok(String(input).startsWith('/api/'), 'must not bypass the proxy');
    if (mode === 'unavailable') return Response.json({}, { status: 503 });
    if (mode === 'empty') return Response.json({ data: { anime: 'Unknown' } });
    return Response.json({ data: detail });
  };
  try {
    const results = await Promise.all([fetchAnimeCoverDetails('Example', 123), fetchAnimeCoverDetails('Example', 123)]);
    assert.equal(calls, 1);
    assert.deepEqual(results[0], detail);
    assert.deepEqual(await fetchAnimeCoverDetails('Other title', 123), detail);
    assert.equal(await fetchAnimeCoverUrl('Other title', 123), detail.coverImage);
    assert.equal(calls, 1);
    assert.deepEqual(createAnimeDetailsCache(() => storage).get('id:123'), detail);
    mode = 'unavailable';
    await fetchAnimeCoverDetails('Unavailable', 124);
    assert.deepEqual(await searchAnime('Unavailable'), []);
    assert.equal(calls, 3);
    mode = 'empty';
    await fetchAnimeCoverDetails('Missing', 125);
    await fetchAnimeCoverDetails('Missing', 125);
    assert.equal(calls, 4, 'empty lookups have a short cooldown too');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
