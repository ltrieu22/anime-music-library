import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { test, type TestContext } from 'node:test';
import { pathToFileURL } from 'node:url';
import { catalogFromDump, mergeCatalog } from '../../scripts/catalogUpdateData';
import { updateCatalog } from '../../scripts/update-catalog';
import { createNoteSongSnapshot, findNoteForSong, getSongNoteKey } from './notesStorage';

const anime = { animeENName: null, animeJPName: 'Anime', animeAltName: ['Other'], animeVintage: 'Fall 2027', linked_ids: { anilist: null } };
const song = (annSongId: number, songName: string, songArtist = 'Artist') => ({
  annSongId, annId: 1, songName, songArtist, songType: 1, songNumber: 1, HQ: null,
  MQ: 'test.webm', audio: null,
});
const dump = (...songs: ReturnType<typeof song>[]) => ({ anime: { 1: anime }, artists: {}, songs });
const etag = 'W/"test-dump"';
const fetchDump = (payload: ReturnType<typeof dump>, count = payload.songs.length): typeof fetch => async input =>
  String(input).endsWith('/database_stats') ? Response.json({ total_songs: count })
    : Response.json(payload, { headers: { ETag: etag } });

async function fixture(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), 'catalog-update-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = pathToFileURL(dir + sep);
  const source = new URL('public/data/anime_catalog.json', root);
  const report = new URL('data/catalog-update-report.json', root);
  const stage = new URL('.cache/catalog-update/anime_catalog.staged.json', root);
  await mkdir(new URL('public/data/', root), { recursive: true });
  await mkdir(new URL('data/', root));
  const original = Buffer.from(JSON.stringify([...catalogFromDump(dump(song(4, 'Old'), song(2, 'Retained'))).values()]) + '\n');
  await writeFile(source, original);
  return { root, source, report, stage, original };
}

test('dump uses language and media fallbacks and rejects incomplete or duplicate rows', () => {
  const mapped = catalogFromDump(dump(song(1, 'Opening'))).get('song-1')!;
  assert.equal(mapped.anime_name_english, 'Anime');
  assert.equal(mapped.anime_name_romaji, 'Anime');
  assert.equal(mapped.anime_year, 2027);
  assert.equal(mapped.theme_type, 'Opening 1');
  assert.equal(mapped.video_url, 'https://naedist.animemusicquiz.com/test.webm');
  assert.throws(() => catalogFromDump(dump()), /empty catalog/);
  assert.throws(() => catalogFromDump(dump(song(1, 'A'), song(1, 'B'))), /Duplicate ANN song ID/);
  assert.throws(() => catalogFromDump(dump({ ...song(1, 'A'), annId: 2 })), /invalid anime metadata/);
  assert.throws(() => catalogFromDump(dump({ ...song(1, 'A'), MQ: 'javascript:test' })), /invalid media URL/);
});

test('legacy notes retain unique matches through repeated updates without linking ambiguous fingerprints', () => {
  const before = [...catalogFromDump(dump(song(1, 'Old'), song(2, 'Shared'), song(3, 'Shared'))).values()];
  const first = mergeCatalog(before, catalogFromDump(dump({ ...song(1, 'New'), MQ: null }, song(2, 'Two'), song(3, 'Three'))));
  const second = mergeCatalog(first.catalog, catalogFromDump(dump(song(1, 'Newest'), song(2, 'Two'), song(3, 'Three'))));
  assert.equal(first.catalog[0].video_url, before[0].video_url);
  assert.deepEqual(first.preservedMedia, [{ id: 'song-1', field: 'video_url' }]);
  assert.deepEqual(first.ambiguousFingerprints, ['song-2', 'song-3']);
  for (const song of first.catalog.slice(1)) assert.equal(song.legacy_song_fingerprints, undefined);
  const note = { songKey: 'collection:17', text: 'Legacy', updatedAt: '2026-11-22T00:00:00Z',
    song: createNoteSongSnapshot({ ...before[0], id: 17 }) };
  assert.equal(findNoteForSong({ [note.songKey]: note }, second.catalog[0]), note);
  const exact = { ...note, songKey: 'catalog:song-1', text: 'Exact' };
  assert.equal(findNoteForSong({ [note.songKey]: note, [exact.songKey]: exact }, second.catalog[0]), exact);
  assert.equal(getSongNoteKey(second.catalog[0]), getSongNoteKey(before[0]));
});

test('preview leaves source alone, promotion preserves order and supports conditional no-ops', async t => {
  const { root, source, report, original } = await fixture(t);
  const response = await updateCatalog('preview', root, fetchDump(dump(song(12, 'Append second'), song(4, 'Updated'), song(6, 'Append first'))));
  assert.ok('catalog' in response);
  assert.deepEqual(await readFile(source), original);
  await assert.rejects(readFile(report), { code: 'ENOENT' });
  assert.deepEqual([response.added, response.changed, response.retained], [2, 1, 1]);
  const published = await updateCatalog('promote', root);
  assert.deepEqual(published, response);
  assert.deepEqual(JSON.parse((await readFile(source)).toString()).map(row => row.id), ['song-4', 'song-2', 'song-6', 'song-12']);
  const beforeSha256 = createHash('sha256').update(original).digest('hex');
  assert.deepEqual(await readFile(new URL(`.cache/catalog-update/before-${beforeSha256}.json`, root)), original);
  assert.deepEqual(await updateCatalog('promote', root), published);
  const canonical = await readFile(source);
  const receipt = await readFile(report);
  const noChange = await updateCatalog('preview', root, async (_input, init) => {
    assert.equal(new Headers(init?.headers).get('If-None-Match'), etag);
    return new Response(null, { status: 304 });
  });
  assert.equal(noChange.result, 'not-modified');
  assert.deepEqual(await readFile(source), canonical);
  assert.deepEqual(await readFile(report), receipt);
});

test('upstream errors, mismatched counts and corrupted or stale previews cannot replace the catalog', async t => {
  const { root, source, stage, original } = await fixture(t);
  const request = fetchDump(dump(song(4, 'Updated')));
  await assert.rejects(updateCatalog('preview', root, async () => new Response(null, { status: 503 })), /HTTP 503/);
  await assert.rejects(updateCatalog('preview', root, fetchDump(dump(song(4, 'Updated')), 2)), /counts disagree/);
  await assert.rejects(updateCatalog('preview', root, async () => new Response(null, { status: 304 })), /unexpected 304/);
  await updateCatalog('preview', root, request);
  await writeFile(stage, '[]');
  await assert.rejects(updateCatalog('promote', root), /Staged catalog changed/);
  assert.deepEqual(await readFile(source), original);
  await updateCatalog('preview', root, request);
  const edited = Buffer.concat([original, Buffer.from('\n')]);
  await writeFile(source, edited);
  await assert.rejects(updateCatalog('promote', root), /changed since preview/);
  assert.deepEqual(await readFile(source), edited);
});
