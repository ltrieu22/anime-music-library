import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import type { AnimeSongItem } from '../src/types';
import { getSongNoteKey, getSongMetadataFingerprint } from '../src/services/notesStorage';

const root = new URL('../', import.meta.url);
const source = new URL('public/data/anime_catalog.json', root);
const work = new URL('.cache/title-enrichment/', root);
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const titleKeys = ['anime_name_english', 'anime_name_romaji', 'anime_alt_names'];
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 1 && args[0] === '--promote'), 'Only --promote is supported');
const promote = args.includes('--promote');
const sourceBytes = await readFile(source);
const originalPath = new URL('anime_catalog.original.json', work);
const originalBytes = await readFile(originalPath).catch((error) => {
  if (error.code === 'ENOENT') return sourceBytes;
  throw error;
});
const original: AnimeSongItem[] = JSON.parse(originalBytes.toString('utf8'));
const staged: AnimeSongItem[] = JSON.parse(await readFile(new URL('anime_catalog.enriched.json', work), 'utf8'));
const progress = JSON.parse(await readFile(new URL('preview.json', work), 'utf8'));
assert.equal(progress.sourceSha256, hash(originalBytes), 'Preview must describe this exact original catalogue');
assert.equal(progress.selectedRows, 38_821);
assert.equal(progress.counts.pending, 0);
assert.equal(original.length, 38_821);
assert.equal(staged.length, original.length);
assert.equal(progress.mappings.length, original.length);
assert.equal(new Set(staged.map((song) => song.id)).size, 38_821);
for (let index = 0; index < original.length; index++) {
  const before = original[index];
  const after = staged[index];
  const mapping = progress.mappings[index];
  assert.equal(after.id, before.id, `Row order/ID at ${index}`);
  assert.equal(mapping.id, before.id);
  for (const key of Object.keys(before)) assert.deepEqual(after[key], before[key], `${before.id}: changed ${key}`);
  assert.ok(Object.keys(after).every((key) => key in before || titleKeys.includes(key)), `${before.id}: unexpected field`);
  assert.ok(['matched', 'unmatched', 'ambiguous', 'mismatched'].includes(mapping.status));
  assert.deepEqual(after, mapping.status === 'matched' ? { ...before, ...mapping.metadata } : before);
  if (mapping.status === 'matched') {
    assert.ok(after.anime_name_english?.trim());
    assert.ok(after.anime_name_romaji?.trim());
    if (after.anime_alt_names !== undefined) assert.ok(Array.isArray(after.anime_alt_names) && after.anime_alt_names.every((name) => typeof name === 'string'));
  }
  assert.equal(getSongNoteKey(after), getSongNoteKey(before));
  assert.equal(getSongMetadataFingerprint(after), getSongMetadataFingerprint(before));
}
const count = (predicate: (song: AnimeSongItem) => boolean) => staged.filter(predicate).length;
const opening = count((song) => song.theme_type?.startsWith('Opening') ?? false);
const ending = count((song) => song.theme_type?.startsWith('Ending') ?? false);
const insert = count((song) => song.theme_type?.startsWith('Insert') ?? false);
const pre1980 = count((song) => song.anime_year < 1980);
assert.deepEqual([opening, ending, insert, pre1980], [8_873, 15_317, 14_631, 1_173]);
for (const id of ['song-34830', 'song-34831']) {
  const song = staged.find((song) => song.id === id)!;
  assert.equal(song.anime_name, 'The Heike Story');
  assert.equal(song.anime_name_english, 'The Heike Story');
  assert.equal(song.anime_name_romaji, 'Heike Monogatari');
}
assert.ok(staged.some((song) => song.anime_name === 'Mazinger Z' && song.anime_year === 1972));
// Match the source's compact representation; avoid a formatting-only payload increase.
const output = Buffer.from(JSON.stringify(staged) + (originalBytes.at(-1) === 10 ? '\n' : ''));
assert.ok([hash(originalBytes), hash(output)].includes(hash(sourceBytes)), 'Canonical source changed unexpectedly');
const unresolved = progress.mappings.filter((mapping) => mapping.status !== 'matched');
const actualCounts = Object.fromEntries(['matched', 'unmatched', 'ambiguous', 'mismatched', 'pending'].map((status) =>
  [status, progress.mappings.filter((mapping) => mapping.status === status).length]));
assert.deepEqual(progress.counts, actualCounts);
const samples = ['The Heike Story', 'Attack on Titan', 'Demon Slayer: Kimetsu no Yaiba', 'Spirited Away', 'Mazinger Z'].map((title) => {
  const song = staged.find((song) => song.anime_name === title && song.anime_name_romaji);
  return song ? { id: song.id, anime_name: song.anime_name, year: song.anime_year,
    english: song.anime_name_english, romaji: song.anime_name_romaji, alternatives: song.anime_alt_names } : { anime_name: title, found: false };
});
const report = {
  version: 1, validatedAt: new Date().toISOString(), canonicalSource: 'public/data/anime_catalog.json',
  metadataEndpoint: 'https://anisongdb.com/api/ann_song_ids_request',
  originalSha256: hash(originalBytes), enrichedSha256: hash(output),
  rows: staged.length, uniqueIds: new Set(staged.map((song) => song.id)).size,
  opening, ending, insert, pre1980, mappingCounts: actualCounts,
  coverage: {
    english: count((song) => Boolean(song.anime_name_english?.trim())),
    romaji: count((song) => Boolean(song.anime_name_romaji?.trim())),
    alternateNameArrays: count((song) => Array.isArray(song.anime_alt_names)),
    nonemptyAlternateNames: count((song) => Boolean(song.anime_alt_names?.length)),
  },
  bytes: { original: originalBytes.length, enriched: output.length, added: output.length - originalBytes.length,
    originalGzip: gzipSync(originalBytes).length, enrichedGzip: gzipSync(output).length },
  allExistingFieldsAndOrderPreserved: true, persistentIdentitiesPreserved: true,
  unexpectedUpstreamIds: progress.unexpectedIds, samples, unresolved,
};
await writeFile(new URL('validation.json', work), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (promote) {
  // Preserve the exact pre-enrichment source once; an unrelated backup must never be overwritten.
  try { await writeFile(originalPath, originalBytes, { flag: 'wx' }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  assert.equal(hash(await readFile(originalPath)), hash(originalBytes));
  assert.equal(hash(await readFile(source)), hash(sourceBytes), 'Source changed during validation');
  const temporary = new URL('public/data/anime_catalog.json.enrichment.tmp', root);
  await writeFile(temporary, output, { flag: 'wx' });
  await rename(temporary, source);
  await writeFile(new URL('data/catalog-title-enrichment-report.json', root), JSON.stringify(report, null, 2) + '\n');
  console.log(`Promoted validated catalogue: ${fileURLToPath(source)}`);
}
