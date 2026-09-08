import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { AnimeSongItem } from '../types';
import { createCatalogLoader } from './catalogLoader';
import { packCatalog, unpackCatalog } from './catalogPayload';
import { resolveSharedSong } from './songSharing';

const song: AnimeSongItem = { id: 'song-1', anime_name: 'Test', anime_year: 2021, artist: 'Test', song_name: 'Test', audio_url: 'https://example.test/song.mp3' };
const payload = packCatalog([song]);

test('compact catalog round-trips every canonical field, ID and playback URL', () => {
  const catalog = JSON.parse(readFileSync(new URL('../../public/data/anime_catalog.json', import.meta.url), 'utf8'));
  const decoded = unpackCatalog(JSON.parse(JSON.stringify(packCatalog(catalog))));
  assert.equal(decoded.length, 38_821);
  assert.deepEqual(decoded, catalog);
  assert.deepEqual(resolveSharedSong('song-34830', decoded), catalog.find((item: AnimeSongItem) => item.id === 'song-34830'));
  assert.deepEqual(unpackCatalog(packCatalog([song, { ...song, id: 'song-2', video_url: null, anime_alt_names: ['が', 'fhána'] }])),
    [song, { ...song, id: 'song-2', video_url: null, anime_alt_names: ['が', 'fhána'] }]);
});

test('invalid compact data is rejected instead of becoming valid empty results', () => {
  for (const invalid of [null, [], {}, { ...payload, version: 2 }, { ...payload, rows: [[999]] },
    { ...payload, rows: [payload.rows[0], payload.rows[0]] }, { ...payload, fields: payload.fields.map(() => '__proto__') }]) {
    assert.throws(() => unpackCatalog(invalid), /invalid/);
  }
});

test('HTTP, network, JSON, schema and alias failures all allow a successful shared retry', async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const failure of ['http', 'network', 'json', 'schema', 'alias-http', 'alias-network', 'alias-json', 'alias-schema']) {
      const loader = createCatalogLoader(() => '/anime_db/');
      let broken = true;
      let calls = 0;
      let notifications = 0;
      loader.subscribe(() => { notifications++; });
      globalThis.fetch = async input => {
        calls++;
        const url = String(input);
        assert.ok(url.startsWith('/anime_db/data/'));
        const isAlias = url.endsWith('artist_aliases.json');
        if (broken && isAlias === failure.startsWith('alias-')) {
          if (failure.endsWith('network')) throw new TypeError('Failed to fetch');
          if (failure.endsWith('http')) return new Response('', { status: 503 });
          if (failure.endsWith('json')) return new Response('invalid JSON');
          return Response.json({ invalid: true });
        }
        return Response.json(isAlias ? { test: ['Alias'] } : payload);
      };
      const first = loader.load();
      const concurrent = loader.load();
      assert.equal(first, concurrent, failure);
      await assert.rejects(first);
      assert.equal(notifications, 0, failure);
      assert.equal(calls, 2, failure);
      broken = false;
      const [catalog, aliases] = await loader.load();
      assert.deepEqual(catalog, [song], failure);
      assert.deepEqual(aliases, { test: ['Alias'] });
      assert.equal(notifications, 1, failure);
      assert.equal(calls, 4, failure);
      assert.equal((await loader.load())[0], catalog);
      assert.equal(calls, 4, 'success is cached');
      let lateCatalog;
      const unsubscribe = loader.subscribe(([songs]) => { lateCatalog = songs; });
      assert.equal(lateCatalog, catalog, 'late title/season consumers receive the recovered catalog');
      unsubscribe();
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('a valid empty catalog remains a successful cached result', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async input => {
    calls++;
    return Response.json(String(input).endsWith('artist_aliases.json') ? {} : packCatalog([]));
  };
  try {
    const loader = createCatalogLoader(() => './');
    assert.deepEqual(await loader.load(), [[], {}]);
    assert.deepEqual(await loader.load(), [[], {}]);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = originalFetch; }
});
