import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { AnimeSongEntry, AnimeSongItem } from '../types';
import { copyAnimeTitleMetadata, getAnimeDisplayTitle, getSearchableAnimeTitles } from './animeTitles';
import { getSongMetadataFingerprint, getSongNoteKey, createNoteSongSnapshot, saveNotes, loadNotes } from './notesStorage';
import { mapAnisongDbSong } from './anisongdbArtists';
import { BACKUP_VERSION, sanitizeEntry, sanitizeNotes } from './dataBackup';
import { createEntry, fetchEntries, importEntries, updateEntry } from './api';
import { toSongTrack } from '../utils/player';
import { matchTitleMetadata } from './titleEnrichment';
import { runTitleEnrichment } from '../../scripts/enrich-titles';

// Projection of the two live AniSongDB responses verified on 2026-09-06 (local date).
const upstream = JSON.parse(readFileSync(new URL('./fixtures/heike-titles.json', import.meta.url), 'utf8'));
const catalog: AnimeSongItem[] = JSON.parse(readFileSync(new URL('../../public/data/anime_catalog.json', import.meta.url), 'utf8'));
const heike = catalog.filter((song) => ['song-34830', 'song-34831'].includes(String(song.id)));

test('old records keep their title; fallback prefers romaji, English, then legacy title', () => {
  const old = { anime_name: 'The Heike Story' };
  assert.equal(getAnimeDisplayTitle(old), 'The Heike Story');
  assert.deepEqual(copyAnimeTitleMetadata(old), {});
  assert.deepEqual(getSearchableAnimeTitles(old), ['The Heike Story']);
  assert.equal(getAnimeDisplayTitle({ anime_name: 'Legacy', anime_name_english: 'English', anime_name_romaji: 'Romaji' }), 'Romaji');
  assert.equal(getAnimeDisplayTitle({ anime_name: 'Legacy', anime_name_english: 'English', anime_name_romaji: '  ' }), 'English');
  assert.equal(getAnimeDisplayTitle({ anime_name: 'Legacy', anime_name_english: '' }), 'Legacy');
  assert.equal(getAnimeDisplayTitle({ anime_name: ' ' }), 'Unknown Anime');
  assert.equal(getAnimeDisplayTitle({}), 'Unknown Anime');
});

test('title variants deduplicate for matching without changing stored strings or arrays', () => {
  const song = { anime_name: 'The Heike Story', anime_name_english: 'THE HEIKE STORY', anime_name_romaji: 'Heike Monogatari',
    anime_alt_names: [' heike   monogatari ', '平家物語', '', 'Another Name', 'Ａｎｏｔｈｅｒ Ｎａｍｅ'] };
  const before = JSON.stringify(song);
  assert.deepEqual(getSearchableAnimeTitles(song), ['The Heike Story', 'Heike Monogatari', '平家物語', 'Another Name']);
  assert.equal(JSON.stringify(song), before);
  assert.deepEqual(copyAnimeTitleMetadata(song).anime_alt_names, song.anime_alt_names);
  assert.notEqual(copyAnimeTitleMetadata(song).anime_alt_names, song.anime_alt_names);
  assert.deepEqual(copyAnimeTitleMetadata({ anime_name_romaji: 123, anime_alt_names: ['Title', null, 7] }), { anime_alt_names: ['Title'] });
});

test('Heike exact-ID mapping preserves every existing field and song/note/playback identity', () => {
  assert.equal(heike.length, 2);
  for (const song of heike) {
    const mapping = matchTitleMetadata(song, upstream);
    assert.equal(mapping.status, 'matched');
    assert.equal(mapping.annId, 24700);
    assert.deepEqual(mapping.metadata, { anime_name_english: 'The Heike Story', anime_name_romaji: 'Heike Monogatari', anime_alt_names: [] });
    const enriched = { ...song, ...mapping.metadata };
    for (const key of Object.keys(song)) assert.deepEqual(enriched[key], song[key], key);
    assert.equal(getSongNoteKey(enriched), getSongNoteKey(song));
    assert.equal(getSongMetadataFingerprint(enriched), getSongMetadataFingerprint(song));
    assert.deepEqual(toSongTrack(enriched, 'catalog'), toSongTrack(song, 'catalog'));
    const mapped = mapAnisongDbSong(upstream.find((candidate) => `song-${candidate.annSongId}` === song.id))!;
    assert.equal(mapped.id, song.id);
    assert.equal(mapped.anime_name, song.anime_name);
    assert.deepEqual(copyAnimeTitleMetadata(mapped), mapping.metadata);
  }
});

test('matching rejects missing, duplicate, conflicting and unrelated IDs with no AniList/fuzzy fallback', () => {
  const song = heike[0];
  const raw = upstream.find((candidate) => `song-${candidate.annSongId}` === song.id);
  assert.equal(matchTitleMetadata(song, []).status, 'unmatched');
  assert.equal(matchTitleMetadata(song, [raw, raw]).status, 'ambiguous');
  assert.equal(matchTitleMetadata(song, [{ ...raw, annSongId: 999 }]).status, 'unmatched');
  for (const edit of [{ songName: 'Nearly Hikaru Toki' }, { songArtist: 'Other' }, { animeVintage: 'Summer 2022' },
    { songType: 'Insert Song' }, { animeJPName: '' }, { linked_ids: { anilist: 999 } }]) {
    const result = matchTitleMetadata(song, [{ ...raw, ...edit }]);
    assert.equal(result.status, 'mismatched');
    assert.equal(result.metadata, undefined);
  }
  assert.equal(matchTitleMetadata({ ...song, anime_name_romaji: 'Existing conflicting value' }, [raw]).status, 'mismatched');
  assert.equal(matchTitleMetadata({ ...song, id: 'anilist-138714' }, [raw]).status, 'mismatched');
});

test('collection, notes and JSON backups preserve optional metadata, saved IDs and order', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => { memory.set(key, value); },
  } });
  try {
    const metadata = { anime_name_english: 'The Heike Story', anime_name_romaji: 'Heike Monogatari', anime_alt_names: ['平家物語', ' Another title '] };
    const old: AnimeSongEntry = { id: 7, anime_name: 'Old', anime_year: 1972, song_name: 'Old song', artist: 'Old artist' };
    await importEntries([old]);
    const { id: sourceId, anilist_id, anime_vintage, ...savedFields } = heike[0];
    const created = await createEntry({ ...savedFields, ...metadata, source_song_id: String(sourceId), video_url: heike[0].video_url ?? undefined, audio_url: heike[0].audio_url ?? undefined });
    assert.equal(created.id, 8);
    assert.equal(getSongNoteKey(created), getSongNoteKey(heike[0]));
    await updateEntry(8, { song_name: created.song_name });
    const entries = await fetchEntries();
    assert.deepEqual(entries.map((entry) => entry.id), [7, 8]);
    assert.deepEqual(copyAnimeTitleMetadata(entries[1]), metadata);
    const key = getSongNoteKey(created);
    const snapshot = createNoteSongSnapshot(created);
    assert.deepEqual(copyAnimeTitleMetadata(snapshot), metadata);
    const notes = { [key]: { songKey: key, song: snapshot, text: 'Private note', updatedAt: '2026-09-06T00:00:00.000Z' } };
    assert.equal(saveNotes(notes), true);
    assert.deepEqual(loadNotes(), notes);
    const json = JSON.parse(JSON.stringify({ version: BACKUP_VERSION, entries, notes }));
    assert.deepEqual(json.entries.map(sanitizeEntry), entries);
    assert.deepEqual(sanitizeNotes(json.notes), notes);
    assert.deepEqual([old].map(sanitizeEntry), [old], 'legacy array backup');
    const oldSnapshot = createNoteSongSnapshot(old);
    const oldNotes = { 'collection:7': { songKey: 'collection:7', song: oldSnapshot, text: 'Old note', updatedAt: notes[key].updatedAt } };
    assert.deepEqual(sanitizeNotes(oldNotes), oldNotes);
    assert.equal(saveNotes(oldNotes), true);
    assert.deepEqual(loadNotes(), oldNotes);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});

test('enrichment resumes a bounded Heike run from cache and never changes the source', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'anime-title-test-'));
  const source = path.join(dir, 'catalog.json');
  const work = path.join(dir, 'cache');
  const bytes = JSON.stringify(heike);
  await writeFile(source, bytes);
  const calls: number[][] = [];
  const request = async (ids: number[]) => {
    calls.push(ids);
    return upstream.filter((candidate) => ids.includes(candidate.annSongId));
  };
  try {
    const first = await runTitleEnrichment({ ids: heike.map((song) => String(song.id)), limit: 1 }, source, work, request);
    assert.equal(first.counts.matched, 1);
    assert.equal(first.counts.pending, 1);
    const next = await runTitleEnrichment({ ids: heike.map((song) => String(song.id)), limit: 1 }, source, work, request);
    assert.equal(next.cacheHits, 1);
    assert.equal(next.counts.matched, 2);
    const resumed = await runTitleEnrichment({ ids: heike.map((song) => String(song.id)), limit: 2 }, source, work, async () => { throw new Error('Must not refetch'); });
    assert.equal(resumed.requests, 0);
    assert.equal(resumed.cacheHits, 2);
    assert.equal(new Set(calls.flat()).size, 2);
    assert.equal(await readFile(source, 'utf8'), bytes);
    await assert.rejects(readFile(path.join(work, 'anime_catalog.enriched.json')), /ENOENT/);
    // --full here means only the two-song temporary fixture, never the production catalog.
    await runTitleEnrichment({ full: true, stage: true }, source, work, async () => { throw new Error('Must not refetch'); });
    const staged = JSON.parse(await readFile(path.join(work, 'anime_catalog.enriched.json'), 'utf8'));
    assert.deepEqual(staged.map((song) => song.id), heike.map((song) => song.id));
    for (let index = 0; index < heike.length; index++) {
      for (const key of Object.keys(heike[index])) assert.deepEqual(staged[index][key], heike[index][key]);
      assert.equal(staged[index].anime_name_romaji, 'Heike Monogatari');
    }
    assert.equal(await readFile(source, 'utf8'), bytes);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('failed requests remain pending; unresolved candidates are reported and retried only explicitly', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'anime-title-test-'));
  const source = path.join(dir, 'catalog.json');
  const work = path.join(dir, 'cache');
  await writeFile(source, JSON.stringify(heike));
  const options = { ids: heike.map((song) => String(song.id)), limit: 2 };
  try {
    await assert.rejects(runTitleEnrichment(options, source, work, async () => { throw new Error('Offline'); }), /Offline/);
    assert.equal(JSON.parse(await readFile(path.join(work, 'progress.json'), 'utf8')).counts.pending, 2);
    const raw = upstream.find((candidate) => `song-${candidate.annSongId}` === heike[0].id);
    const unresolved = await runTitleEnrichment(options, source, work, async () => [raw, raw]);
    assert.equal(unresolved.counts.ambiguous, 1);
    assert.equal(unresolved.counts.unmatched, 1);
    assert.ok(unresolved.mappings.every((mapping) => !('metadata' in mapping)));
    const stored = JSON.parse(await readFile(path.join(work, 'progress.json'), 'utf8'));
    assert.deepEqual(stored.mappings.map((mapping) => mapping.status), ['ambiguous', 'unmatched']);
    const cached = await runTitleEnrichment(options, source, work, async () => { throw new Error('Must not refetch'); });
    assert.equal(cached.requests, 0);
    const retry = await runTitleEnrichment({ ...options, retryUnresolved: true }, source, work, async () => upstream);
    assert.equal(retry.fetchedIds, 2);
    assert.equal(retry.counts.matched, 2);
    await assert.rejects(readFile(path.join(work, 'anime_catalog.enriched.json')), /ENOENT/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
