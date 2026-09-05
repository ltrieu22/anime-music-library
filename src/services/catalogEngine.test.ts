import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, test } from 'node:test';
import type { AnimeSongItem } from '../types';
import { loadStaticCatalog, searchStaticCatalog } from './catalogEngine';
import { createCatalogQueryMatcher } from './catalogSearch';

const readData = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const catalog: AnimeSongItem[] = readData('../../public/data/anime_catalog.json');
const aliases: Record<string, string[]> = readData('../../public/data/artist_aliases.json');
const ids = (songs: AnimeSongItem[]) => songs.map((song) => song.id).sort();

before(async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    assert.ok(url.endsWith('data/anime_catalog.json') || url.endsWith('data/artist_aliases.json'));
    return Response.json(url.endsWith('data/anime_catalog.json') ? catalog : aliases);
  };
  try {
    await loadStaticCatalog();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('bundled Heike search returns only the two direct songs', async () => {
  for (const q of ['Heike', '  HEIKE  ', 'heike story']) {
    const result = await searchStaticCatalog({ q });
    assert.equal(result.total, 2, q);
    assert.equal(result.hasMore, false);
    assert.deepEqual(ids(result.data), ['song-34830', 'song-34831']);
  }
});

test('IKE expands to SPYAIR and SPYAIR remains directly searchable', async () => {
  const spyairSongs = catalog.filter((song) => song.artist === 'SPYAIR');
  assert.equal(spyairSongs.length, 25);
  for (const q of ['IKE', 'SPYAIR']) {
    const result = await searchStaticCatalog({ q, limit: 500 });
    assert.ok(spyairSongs.every(createCatalogQueryMatcher(q, aliases)), q);
    const directMatches = catalog.filter((song) => `${song.anime_name} ${song.artist} ${song.song_name}`.toLowerCase().includes(q.toLowerCase()));
    assert.ok(result.total >= new Set(ids([...directMatches, ...spyairSongs])).size, q);
    if (q === 'IKE') assert.equal(result.total, new Set(ids([...directMatches, ...spyairSongs])).size);
  }
});

test('partial anime and song terms keep direct substring matching', async () => {
  const expected = catalog.filter((song) => `${song.anime_name} ${song.artist} ${song.song_name}`.toLowerCase().includes('heik'));
  assert.deepEqual(ids((await searchStaticCatalog({ q: 'heik' })).data), ids(expected));
});

test('alias expansion keeps additional anime and song terms required', async () => {
  const expected = catalog.filter((song) => song.artist === 'SPYAIR' && song.song_name === 'Kill the Noise');
  assert.equal(expected.length, 2);
  for (const q of ['IKE kill noise', 'kill IKE noise', 'SPYAIR kill noise']) {
    assert.deepEqual(ids((await searchStaticCatalog({ q })).data), ids(expected), q);
  }
  assert.equal((await searchStaticCatalog({ q: 'IKE nonexistent-title' })).total, 0);
  assert.deepEqual(ids((await searchStaticCatalog({ q: 'heike unified' })).data), ['song-34831']);
});

test('year and theme filters apply to direct and expanded matches', async () => {
  assert.deepEqual(ids((await searchStaticCatalog({ q: 'Heike', yearMin: 2021, yearMax: 2021, themeType: 'OP' })).data), ['song-34830']);
  assert.deepEqual(ids((await searchStaticCatalog({ q: 'Heike', themeType: 'ED' })).data), ['song-34831']);
  assert.equal((await searchStaticCatalog({ q: 'Heike', yearMin: 2022 })).total, 0);
  assert.equal((await searchStaticCatalog({ q: 'Heike', yearMax: 2020 })).total, 0);
  assert.equal((await searchStaticCatalog({ q: 'Heike', themeType: 'IN' })).total, 0);
  const result = await searchStaticCatalog({ q: 'IKE kill noise', yearMin: 2026, yearMax: 2026, themeType: 'ED' });
  assert.deepEqual(ids(result.data), ['song-47528']);
});

test('canonical catalog is complete and unfiltered by default', async () => {
  assert.equal(catalog.length, 38_821);
  assert.equal(new Set(catalog.map((song) => song.id)).size, 38_821);
  assert.equal(catalog.filter((song) => String(song.theme_type).startsWith('Opening')).length, 8_873);
  assert.equal(catalog.filter((song) => String(song.theme_type).startsWith('Ending')).length, 15_317);
  assert.equal(catalog.filter((song) => String(song.theme_type).startsWith('Insert')).length, 14_631);
  assert.equal(catalog.filter((song) => Number(song.anime_year) < 1980).length, 1_173);

  const result = await searchStaticCatalog({ limit: 500 });
  assert.equal(result.total, 38_821);

  const fullUiRange = await searchStaticCatalog({ yearMin: 1924, yearMax: 2026, limit: 500 });
  assert.equal(fullUiRange.total, 38_821);
});

test('Mazinger Z is searchable without a year filter and explicit year filters still apply', async () => {
  const unfiltered = await searchStaticCatalog({ q: 'Mazinger Z', limit: 500 });
  assert.ok(unfiltered.data.some((song) => song.anime_name === 'Mazinger Z' && song.anime_year === 1972));

  const in1972 = await searchStaticCatalog({ q: 'Mazinger Z', yearMin: 1972, yearMax: 1972, limit: 500 });
  assert.ok(in1972.data.length > 0);
  assert.ok(in1972.data.every((song) => song.anime_year === 1972));

  const since1980 = await searchStaticCatalog({ q: 'Mazinger Z', yearMin: 1980, limit: 500 });
  assert.ok(since1980.data.every((song) => Number(song.anime_year) >= 1980));
  assert.ok(since1980.total < unfiltered.total);
});

test('complete multiword and punctuated artist aliases work without substring expansion', () => {
  const song = { anime_name: 'Overlord', artist: 'OxT', song_name: 'Clattanoia' };
  assert.equal(createCatalogQueryMatcher('Masayoshi   Oishi overlord', aliases)(song), true);
  assert.equal(createCatalogQueryMatcher('Tom-H@ck clattanoia', aliases)(song), true);
  assert.equal(createCatalogQueryMatcher('Masayoshi Oishi heike', aliases)(song), false);
  assert.equal(createCatalogQueryMatcher('masay', aliases)(song), false);
  assert.equal(createCatalogQueryMatcher('preoxt', aliases)({ ...song, artist: 'Tom-H@ck' }), false);
});

test('expanded artist names use boundaries, including Unicode, and stay in the artist field', () => {
  const matches = createCatalogQueryMatcher('SPYAIR', aliases);
  const song = { anime_name: 'Example', song_name: 'Example', artist: 'IKE' };
  assert.equal(matches(song), true);
  assert.equal(matches({ ...song, artist: 'Guest feat. IKE' }), true);
  for (const artist of ['Heike', 'IKEA', '池IKE田']) {
    assert.equal(matches({ ...song, artist }), false, artist);
  }
  assert.equal(matches({ ...song, artist: 'Other', song_name: 'IKE' }), false);
  const literal = createCatalogQueryMatcher('A+B', { 'a+b': ['Group (Live)'] });
  assert.equal(literal({ ...song, artist: 'Group (Live)' }), true);
  assert.equal(literal({ ...song, artist: 'Group Live' }), false);
});

test('the shared matcher also works with the server aliases', () => {
  const serverCatalog = catalog;
  const serverAliases = readData('../../data/artist_aliases.json');
  assert.deepEqual(ids(serverCatalog.filter(createCatalogQueryMatcher('Heike', serverAliases))), ['song-34830', 'song-34831']);
});
