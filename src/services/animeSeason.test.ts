import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ANIME_SEASONS, animeSeasonLabel, copyAnimeSeasonMetadata, getAnimeSeason, resolveAnimeSeason } from './animeSeason';
import { searchCatalogResults } from './catalogResults';
import { createNoteSongSnapshot, getSongNoteKey } from './notesStorage';
import { mapAnisongDbSong } from './anisongdbArtists';
import type { AnimeSongItem } from '../types';

const row = (id: number, anime_vintage?: string): AnimeSongItem => ({
  id: `song-${id}`, anime_name: 'Anime', anime_year: 2021, song_name: 'Song', artist: 'Artist', theme_type: 'Opening 1', anime_vintage,
});

test('normalizes four catalog seasons and preserves Unknown without guessing from a year', () => {
  for (const season of ANIME_SEASONS) {
    assert.deepEqual(getAnimeSeason({ anime_vintage: `  ${season.toUpperCase()} 2026 ` }), { season, year: 2026 });
    assert.equal(animeSeasonLabel({ anime_vintage: `${season} 2026` }), `${season} 2026`);
  }
  assert.equal(animeSeasonLabel({ anime_year: 2021 }), 'Unknown 2021');
  assert.equal(animeSeasonLabel({ anime_vintage: '2020' }), 'Unknown 2020');
  assert.equal(animeSeasonLabel({ anime_vintage: 'not a season' }), 'Unknown');
  assert.equal(animeSeasonLabel({ anime_season: 'spring', anime_year: 2020 }), 'Spring 2020');
  assert.deepEqual(copyAnimeSeasonMetadata({ anime_vintage: 12, anime_season: {} }), {});
});

test('season/year ordering, intersections, note merging and bounded pagination share one contract', () => {
  const rows = [row(5), ...[...ANIME_SEASONS].reverse().map((s, i) => row(i + 1, `${s} 2021`)), row(6, 'Winter 2020')];
  const ordered = searchCatalogResults(rows, {}, { sortOrder: 'asc' });
  assert.deepEqual(ordered.data.map(animeSeasonLabel), ['Winter 2020', 'Winter 2021', 'Spring 2021', 'Summer 2021', 'Fall 2021', 'Unknown 2021']);
  assert.deepEqual(searchCatalogResults(rows, {}, { sortOrder: 'desc' }).data.map(animeSeasonLabel), ['Fall 2021', 'Summer 2021', 'Spring 2021', 'Winter 2021', 'Unknown 2021', 'Winter 2020']);
  for (const season of ANIME_SEASONS) {
    const result = searchCatalogResults(rows, {}, { q: 'Song', season, yearMin: 2021, yearMax: 2021, themeType: 'OP', limit: 1, offset: 500 });
    assert.equal(result.total, 1);
    assert.equal(result.offset, 0);
    assert.equal(animeSeasonLabel(result.data[0]), `${season} 2021`);
    assert.equal(searchCatalogResults(rows, {}, { season, themeType: 'ED' }).total, 0);
  }
  assert.equal(searchCatalogResults(rows, {}, { season: 'UNKNOWN' }).total, 1);
  assert.equal(searchCatalogResults(rows, {}, { season: 'invalid' }).total, 0);
  const extra = row(99, 'Winter 2021');
  const merged = searchCatalogResults(rows, {}, { q: 'private note', season: 'Winter' }, [row(4), extra]);
  assert.deepEqual(new Set(merged.data.map(s => s.id)), new Set(['song-4', 'song-99']));
});

test('stable-ID enrichment and upstream conversion retain metadata without changing note identities', () => {
  const canonical = row(1, 'Fall 2021');
  const catalog = new Map([[String(canonical.id), canonical]]);
  const saved = { ...row(2), id: 17, source_song_id: 'song-1' };
  const enriched = resolveAnimeSeason(saved, catalog);
  assert.equal(enriched.id, 17);
  assert.equal(enriched.source_song_id, 'song-1');
  assert.equal(animeSeasonLabel(enriched), 'Fall 2021');
  assert.equal(getSongNoteKey(enriched), getSongNoteKey(saved));
  assert.equal(createNoteSongSnapshot(enriched).anime_vintage, 'Fall 2021');
  assert.equal(saved.anime_vintage, undefined);
  assert.equal(resolveAnimeSeason(row(99), catalog).anime_vintage, undefined);
  const mapped = mapAnisongDbSong({ annSongId: 1, animeVintage: 'Winter 2026' })!;
  assert.equal(animeSeasonLabel(mapped), 'Winter 2026');
});

test('all bundled catalog rows remain reachable when partitioned by season', () => {
  const catalog: AnimeSongItem[] = JSON.parse(readFileSync(new URL('../../public/data/anime_catalog.json', import.meta.url), 'utf8'));
  const ids = new Set<string | number>();
  for (const season of [...ANIME_SEASONS, 'UNKNOWN']) {
    const expected = catalog.filter(s => (getAnimeSeason(s).season ?? 'UNKNOWN') === season).length;
    let count = 0;
    for (let offset = 0; ; offset += 500) {
      const result = searchCatalogResults(catalog, {}, { season, limit: 500, offset });
      assert.equal(result.total, expected);
      for (const song of result.data) { assert.ok(!ids.has(song.id)); ids.add(song.id); count++; }
      if (!result.hasMore) break;
    }
    assert.equal(count, expected);
  }
  assert.equal(ids.size, catalog.length);
});
