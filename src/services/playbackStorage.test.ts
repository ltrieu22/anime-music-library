import assert from 'node:assert/strict';
import test from 'node:test';
import { addRecentSong, PLAYER_SESSION_KEY, RECENT_SONGS_KEY, readPlayerSession, readRecentSongs, writePlayerSession, writeRecentSongs, persistentMediaUrl } from './playbackStorage';
import { initialQueueState, queueReducer } from './playerQueue';
import type { SongTrack } from '../types/player';

const a: SongTrack = { id: 'catalog:song-1', animeTitle: 'Anime', songName: 'First', videoUrl: 'first.webm',
  animeTitles: { anime_name_romaji: 'Romaji', anime_name_english: 'English' },
  actionSong: { id: 'song-1', anime_name: 'Anime', anime_year: 2024, artist: 'Artist', song_name: 'First' } };
const b: SongTrack = { ...a, id: 'collection:2', videoUrl: 'second.webm',
  actionSong: { id: 2, local_song_id: 'manual-2', anime_name: 'Custom', anime_year: 2020, artist: '', song_name: 'Second' } };
function storage() {
  const values = new Map<string, string>();
  const mock = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: mock });
  return mock;
}

test('restores queue occurrences, current index, repeat, title and custom identity, including a zero position', () => {
  storage();
  let queue = queueReducer(initialQueueState, { type: 'replace', tracks: [a, b, a], startIndex: 1, source: 'collection' });
  queue = queueReducer(queue, { type: 'setRepeat', mode: 'all' });
  writePlayerSession(queue, 0);
  const restored = readPlayerSession().value;
  assert.equal(restored.position, 0);
  assert.equal(restored.queue.index, 1);
  assert.equal(restored.queue.repeatMode, 'all');
  assert.equal(restored.queue.playbackRevision, 0);
  assert.equal((restored.queue.items[1].track.actionSong as typeof b.actionSong & { local_song_id: string }).local_song_id, 'manual-2');
  assert.equal(restored.queue.items[0].track.animeTitles?.anime_name_romaji, 'Romaji');
  assert.deepEqual(restored.queue.items.map(item => item.queueItemId), queue.items.map(item => item.queueItemId));
  const appended = queueReducer(restored.queue, { type: 'append', tracks: [a] });
  assert.equal(new Set(appended.items.map(item => item.queueItemId)).size, 4);
});

test('skips unavailable queue entries, selects the next available track, and resets a displaced position', () => {
  storage();
  const queue = queueReducer(initialQueueState, { type: 'replace', tracks: [a, { ...b, videoUrl: 'blob:expired' }, a], startIndex: 1, source: 'collection' });
  writePlayerSession(queue, 72);
  const restored = readPlayerSession();
  assert.equal(restored.value.queue.items.length, 2);
  assert.equal(restored.value.queue.index, 1);
  assert.equal(restored.value.position, 0);
  assert.match(restored.notice, /skipped/);
  writePlayerSession({ ...queue, items: queue.items.slice(0, 2) }, 72);
  assert.equal(readPlayerSession().value.queue.index, 0);
});

test('restoration keeps the current position when an earlier unavailable occurrence is skipped', () => {
  storage();
  const queue = queueReducer(initialQueueState, { type: 'replace', tracks: [{ ...b, videoUrl: '' }, a], startIndex: 1, source: 'collection' });
  writePlayerSession(queue, 42.5);
  assert.equal(readPlayerSession().value.position, 42.5);
  assert.equal(readPlayerSession().value.queue.index, 0);
});

test('corrupt, older and future data remain untouched and do not restore or throw', () => {
  const mock = storage();
  for (const raw of ['broken', 'null', '{"version":0,"queue":[]}', '{"version":99}', '{"version":1,"items":[],"index":"bad"}']) {
    mock.setItem(PLAYER_SESSION_KEY, raw); mock.setItem(RECENT_SONGS_KEY, raw);
    assert.equal(readPlayerSession().value.queue.items.length, 0);
    assert.match(readPlayerSession().notice, /could not be read/);
    assert.deepEqual(readRecentSongs().value, []);
    assert.equal(mock.getItem(PLAYER_SESSION_KEY), raw);
  }
});

test('malformed occurrence IDs are repaired without merging duplicate songs', () => {
  const mock = storage();
  mock.setItem(PLAYER_SESSION_KEY, JSON.stringify({ version: 1, index: 0, position: -10, items: [
    { queueItemId: 'queue:3', track: a }, { queueItemId: 'queue:3', track: a }, { queueItemId: 'bad', track: a },
  ] }));
  const { queue, position } = readPlayerSession().value;
  assert.equal(new Set(queue.items.map(item => item.queueItemId)).size, 3);
  assert.equal(queue.repeatMode, 'off');
  assert.equal(position, 0);
  mock.setItem(PLAYER_SESSION_KEY, JSON.stringify({ version: 1, index: 0, items: [
    { queueItemId: 'queue:9007199254740991', track: a }, { queueItemId: 'restored:2', track: a }, { queueItemId: 'bad', track: a },
  ] }));
  const repaired = readPlayerSession().value.queue;
  writePlayerSession(repaired, 0);
  assert.deepEqual(readPlayerSession().value.queue.items, repaired.items);
  const appended = queueReducer(repaired, { type: 'append', tracks: [a, a] });
  assert.equal(new Set(appended.items.map(item => item.queueItemId)).size, 5);
});

test('history is capped, deduplicated across catalog/saved copies and ordered by latest listen', () => {
  storage();
  const saved = { ...a, id: 'collection:7', actionSong: { ...a.actionSong!, id: 7, source_song_id: 'song-1' } };
  let history = addRecentSong(addRecentSong([], a, 10), b, 20);
  history = addRecentSong(history, saved, 30);
  assert.equal(history.length, 2);
  assert.equal(history[0].track.id, saved.id);
  for (let index = 0; index < 105; index++) history = addRecentSong(history, { ...b, id: index, actionSong: undefined }, index + 40);
  assert.equal(history.length, 100);
  writeRecentSongs(history);
  assert.equal(readRecentSongs().value[0].playedAt, 144);
});

test('history tolerates malformed entries and retains unavailable songs for display', () => {
  const mock = storage();
  mock.setItem(RECENT_SONGS_KEY, JSON.stringify({ version: 1, items: [null, { track: a, playedAt: 1e20 },
    { track: { ...a, videoUrl: 'blob:expired' }, playedAt: 10 }, { track: b, playedAt: 20 }] }));
  const history = readRecentSongs().value;
  assert.equal(history.length, 2);
  assert.equal(history[1].track.videoUrl, '');
});

test('closing removes only the session; clearing history leaves other local data intact', () => {
  const mock = storage();
  mock.setItem('anime_songs_db_v1', 'saved');
  writePlayerSession(queueReducer(initialQueueState, { type: 'append', tracks: [a] }), 42);
  writeRecentSongs(addRecentSong([], a));
  writePlayerSession(initialQueueState, 0);
  assert.equal(mock.getItem(PLAYER_SESSION_KEY), null);
  assert.equal(readRecentSongs().value.length, 1);
  writeRecentSongs([]);
  assert.equal(mock.getItem('anime_songs_db_v1'), 'saved');
});

test('storage failures propagate for visible retry and blocked reads are safe', () => {
  const mock = storage();
  mock.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.throws(() => writeRecentSongs([]), /Quota/);
  assert.throws(() => writePlayerSession(queueReducer(initialQueueState, { type: 'append', tracks: [a] }), 0), /Quota/);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Denied'); } });
  assert.equal(readPlayerSession().value.queue.items.length, 0);
  assert.equal(readRecentSongs().value.length, 0);
  storage();
});

test('persistent media rejects temporary and unsafe schemes while retaining AMQ paths', () => {
  for (const url of ['blob:123', 'javascript:alert(1)', 'data:video/webm;base64,AA', '//example.com/a', 'https://u:p@example.com/a', 'a\nb']) assert.equal(persistentMediaUrl(url), '');
  for (const url of ['a.webm', '/a.webm', 'https://example.com/a.webm']) assert.equal(persistentMediaUrl(url), url);
});
