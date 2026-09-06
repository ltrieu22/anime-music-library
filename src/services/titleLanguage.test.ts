import assert from 'node:assert/strict';
import test from 'node:test';
import { getAnimeDisplayTitle, getSearchableAnimeTitles, readTitleLanguage, resolveAnimeTitles, TITLE_LANGUAGE_STORAGE_KEY } from './animeTitles';
import { createCatalogQueryMatcher } from './catalogSearch';
import { createNoteSongSnapshot, getSongNoteKey } from './notesStorage';
import { toSongTrack } from '../utils/player';

const song = { id: 'song-34830', anime_name: 'The Heike Story', anime_name_english: 'The Heike Story',
  anime_name_romaji: 'Heike Monogatari', anime_alt_names: ['平家物語'], song_name: 'Hikaru Toki',
  artist: 'Hitsujibungaku', anime_year: 2021, video_url: 'https://example.com/heike.webm' };

test('both title languages search all variants without changing songs, notes or playback identity', () => {
  const saved = { ...song, id: 42, source_song_id: song.id };
  const note = createNoteSongSnapshot(saved);
  const track = toSongTrack(saved, 'collection')!;
  const before = JSON.stringify({ saved, note, track });
  for (const language of ['en', 'jp'] as const) {
    const expected = language === 'en' ? 'The Heike Story' : 'Heike Monogatari';
    for (const source of [song, saved, note, track.animeTitles!]) {
      assert.equal(getAnimeDisplayTitle(source, language), expected);
    }
    for (const query of ['The Heike Story', 'Heike Monogatari', '平家物語', 'Monogatari Hikaru']) {
      assert.ok(createCatalogQueryMatcher(query, {})(song), query);
      assert.ok(createCatalogQueryMatcher(query, {})(saved), query);
      assert.ok(createCatalogQueryMatcher(query, {})(note), query);
    }
    assert.equal(getSongNoteKey(saved), getSongNoteKey(song));
    assert.equal(track.id, 'collection:42');
    assert.equal(track.videoUrl, song.video_url);
    assert.equal(JSON.stringify({ saved, note, track }), before);
  }
});

test('language fallbacks work for incomplete and old records', () => {
  assert.equal(getAnimeDisplayTitle({ anime_name_english: 'English', anime_name_romaji: 'Romaji' }, 'en'), 'English');
  assert.equal(getAnimeDisplayTitle({ anime_name_english: ' ', anime_name_romaji: 'Romaji' }, 'en'), 'Romaji');
  assert.equal(getAnimeDisplayTitle({ anime_name_english: 'English', anime_name_romaji: ' ' }, 'jp'), 'English');
  for (const language of ['en', 'jp'] as const) {
    assert.equal(getAnimeDisplayTitle({ anime_name: 'Legacy' }, language), 'Legacy');
    assert.equal(getAnimeDisplayTitle({}, language), 'Unknown Anime');
  }
});

test('legacy catalog copies resolve by stable ID without changing stored fields or guessing manual entries', () => {
  const catalog = new Map([[song.id, song]]);
  const old = { id: 42, source_song_id: song.id, anime_name: 'The Heike Story' };
  const before = JSON.stringify(old);
  const resolved = resolveAnimeTitles(old, catalog);
  assert.equal(getAnimeDisplayTitle(resolved, 'jp'), 'Heike Monogatari');
  assert.ok(getSearchableAnimeTitles(resolved).includes('平家物語'));
  assert.equal(JSON.stringify(old), before);
  assert.equal(resolved.id, 42);
  const manual = { id: 42, anime_name: 'The Heike Story' };
  assert.equal(resolveAnimeTitles(manual, catalog), manual);
  assert.equal(getAnimeDisplayTitle(resolveAnimeTitles({ ...old, anime_name_romaji: 'Custom' }, catalog), 'jp'), 'Custom');
});

test('remembered preference defaults to English and tolerates unavailable or invalid storage', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    for (const [stored, expected] of [[null, 'en'], ['jp', 'jp'], ['en', 'en'], ['invalid', 'en']]) {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
        getItem: (key: string) => { assert.equal(key, TITLE_LANGUAGE_STORAGE_KEY); return stored; },
      } });
      assert.equal(readTitleLanguage(), expected);
    }
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('blocked'); } });
    assert.equal(readTitleLanguage(), 'en');
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
