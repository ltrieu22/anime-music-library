import assert from 'node:assert/strict';
import test from 'node:test';
import { animeDetailsKey, createAnimeDetailsCache, DETAILS_MAX_AGE } from './animeDetailsCache';

const details = { id: 123, anime: 'Example', coverImage: 'https://example.test/cover.jpg', genres: ['Music'], score: 80 };

test('full details survive reloads, resolve by ID, and expire after seven days', () => {
  let clock = 100_000;
  let saved = '';
  const storage = { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value; } };
  const cache = createAnimeDetailsCache(() => storage, () => clock);
  cache.set(animeDetailsKey('English', 123), details);
  const reloaded = createAnimeDetailsCache(() => storage, () => clock);
  assert.deepEqual(reloaded.get(animeDetailsKey('Romaji', 123)), details);
  clock += DETAILS_MAX_AGE;
  assert.equal(reloaded.get(animeDetailsKey('English', 123)), null);
  assert.equal(animeDetailsKey(' Example '), animeDetailsKey('example'));
});

test('malformed storage, invalid details and failed lookups do not poison the cache', () => {
  for (const saved of ['invalid json', '{}', '[null]', JSON.stringify([['id:123', { savedAt: 10, details: { ...details, genres: [123] } }]])]) {
    const cache = createAnimeDetailsCache(() => ({ getItem: () => saved, setItem: () => {} }));
    assert.equal(cache.get('id:123'), null);
    cache.set('id:123', { anime: 'Failed lookup' });
    assert.equal(cache.get('id:123'), null);
  }
});

test('cache retains only 500 entries and keeps working when storage throws', () => {
  const cache = createAnimeDetailsCache(() => { throw new Error('Storage unavailable'); });
  for (let id = 0; id < 501; id++) cache.set(`id:${id}`, details);
  assert.equal(cache.get('id:0'), null);
  assert.deepEqual(cache.get('id:500'), details);
});
