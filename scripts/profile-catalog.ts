import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { packCatalog, unpackCatalog } from '../src/services/catalogPayload';
import { compileCatalogResults } from '../src/services/catalogResults';
import type { AnimeSongItem } from '../src/types';

const canonical = readFileSync('public/data/anime_catalog.json', 'utf8');
const songs: AnimeSongItem[] = JSON.parse(canonical);
const aliases = JSON.parse(readFileSync('public/data/artist_aliases.json', 'utf8'));
const compact = JSON.stringify(packCatalog(songs));
const searchOnly = JSON.stringify(packCatalog(songs.map(({ video_url, audio_url, anilist_id, ...song }) => song)));
const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
const benchmark = (read: () => AnimeSongItem[]) => {
  const parse: number[] = [];
  const order: number[] = [];
  for (let i = 0; i < 11; i++) {
    const start = performance.now();
    const catalog = read();
    const parsed = performance.now();
    compileCatalogResults(catalog, aliases, { yearMin: 1924, yearMax: 2026, sortKey: 'anime_year', sortOrder: 'desc' });
    if (i) { parse.push(parsed - start); order.push(performance.now() - parsed); }
  }
  return { parseAndDecodeMs: median(parse), initialFilterSortMs: median(order) };
};
for (const [label, data] of [['canonical', canonical], ['compact', compact], ['search-only candidate', searchOnly]]) {
  console.log(label, { bytes: Buffer.byteLength(data), gzipBytes: gzipSync(data).length });
}
console.log('canonical timing', benchmark(() => JSON.parse(canonical)));
console.log('compact timing', benchmark(() => unpackCatalog(JSON.parse(compact))));
