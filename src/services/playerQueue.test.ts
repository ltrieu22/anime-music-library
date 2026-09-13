import assert from 'node:assert/strict';
import test from 'node:test';
import type { SongTrack } from '../types/player';
import { canAdvanceQueue, currentQueueItem, initialQueueState, queueReducer as reduce, type QueueState } from './playerQueue';

const a: SongTrack = { id: 'collection:1', animeTitle: 'A', videoUrl: 'a.webm' };
const b: SongTrack = { id: 'catalog:b', animeTitle: 'B', videoUrl: 'b.webm' };
const c: SongTrack = { id: 'catalog:c', animeTitle: 'C', videoUrl: 'c.webm' };
const start = (tracks = [a, b, c], index = 0) => reduce(initialQueueState, {
  type: 'replace', tracks, startIndex: index, source: 'collection',
});
const ids = (state: QueueState) => state.items.map(item => item.track.id);
function unchangedMedia(before: QueueState, after: QueueState) {
  assert.equal(currentQueueItem(after), currentQueueItem(before));
  assert.equal(after.playbackRevision, before.playbackRevision);
}

test('empty operations are safe; empty playQueue preserves existing playback', () => {
  for (const action of [
    { type: 'next' }, { type: 'ended' }, { type: 'previous' }, { type: 'close' }, { type: 'clearUpcoming' },
    { type: 'playNext', tracks: [] },
    { type: 'append', tracks: [] }, { type: 'remove', queueItemId: 'missing' },
    { type: 'moveUpcoming', queueItemId: 'missing', toIndex: 0 },
  ] as const) {
    assert.equal(reduce(initialQueueState, action as Parameters<typeof reduce>[1]), initialQueueState);
  }
  assert.equal(currentQueueItem(initialQueueState), null);
  assert.equal(canAdvanceQueue(initialQueueState), false);
  const state = start();
  assert.equal(reduce(state, { type: 'replace', tracks: [], source: 'collection' }), state);
});

test('Repeat all wraps forward/back and repeats a one-song queue with stable IDs', () => {
  const last = reduce(start(undefined, 2), { type: 'setRepeat', mode: 'all' });
  assert.equal(currentQueueItem(reduce(last, { type: 'next' }))?.track, a);
  assert.equal(currentQueueItem(reduce({ ...last, index: 0 }, { type: 'previous' }))?.track, c);
  assert.ok(canAdvanceQueue(last));
  const single = reduce(start([a]), { type: 'setRepeat', mode: 'all' });
  const looped = reduce(single, { type: 'ended' });
  assert.equal(currentQueueItem(single), currentQueueItem(looped));
  assert.equal(looped.playbackRevision, single.playbackRevision + 1);
  assert.equal(canAdvanceQueue(single), true);
});

test('catalog replacement discards collection/history and stops at the end', () => {
  const collection = start(undefined, 2);
  const state = reduce(collection, { type: 'replace', tracks: [b], source: 'single' });
  assert.deepEqual(ids(state), [b.id]);
  assert.equal(state.index, 0);
  assert.equal(state.source, 'single');
  assert.equal(reduce(state, { type: 'next' }), state);
  assert.equal(canAdvanceQueue(state), false);
  assert.notEqual(state.items[0].queueItemId, collection.items[1].queueItemId);
});

test('append starts an empty manual queue; later appends keep media and order', () => {
  const first = reduce(initialQueueState, { type: 'append', tracks: [b] });
  assert.equal(first.source, 'manual');
  assert.equal(currentQueueItem(first)?.track, b);
  const second = reduce(first, { type: 'append', tracks: [c, a] });
  unchangedMedia(first, second);
  assert.deepEqual(ids(second), [b.id, c.id, a.id]);
  assert.ok(canAdvanceQueue(second));
  const ended = reduce(reduce(second, { type: 'next' }), { type: 'next' });
  assert.equal(reduce(ended, { type: 'next' }), ended);
  assert.equal(canAdvanceQueue(ended), false);
  const extended = reduce(ended, { type: 'append', tracks: [b] });
  unchangedMedia(ended, extended);
  assert.equal(currentQueueItem(reduce(extended, { type: 'next' }))?.track, b);
});

test('duplicate songs get distinct occurrence IDs and advancing them reloads media', () => {
  const state = reduce(initialQueueState, { type: 'append', tracks: [a, a, a] });
  assert.equal(new Set(state.items.map(item => item.queueItemId)).size, 3);
  const next = reduce(state, { type: 'next' });
  assert.equal(currentQueueItem(next)?.track, a);
  assert.notEqual(currentQueueItem(next)?.queueItemId, currentQueueItem(state)?.queueItemId);
  assert.equal(next.playbackRevision, state.playbackRevision + 1);
  const removed = reduce(next, { type: 'remove', queueItemId: next.items[2].queueItemId });
  unchangedMedia(next, removed);
  assert.equal(removed.items.length, 2);
});

test('removing next or history preserves current media and updates the cursor', () => {
  const state = start(undefined, 1);
  const withoutNext = reduce(state, { type: 'remove', queueItemId: state.items[2].queueItemId });
  unchangedMedia(state, withoutNext);
  assert.equal(withoutNext.source, 'manual');
  assert.equal(canAdvanceQueue(withoutNext), false);
  const withoutHistory = reduce(state, { type: 'remove', queueItemId: state.items[0].queueItemId });
  unchangedMedia(state, withoutHistory);
  assert.equal(withoutHistory.index, 0);
  assert.deepEqual(ids(withoutHistory), [b.id, c.id]);
});

test('removing current advances to next; removing current tail closes instead of replaying history', () => {
  const state = start(undefined, 1);
  const next = reduce(state, { type: 'remove', queueItemId: state.items[1].queueItemId });
  assert.equal(currentQueueItem(next)?.track, c);
  assert.equal(next.playbackRevision, state.playbackRevision + 1);
  const closed = reduce(next, { type: 'remove', queueItemId: next.items[1].queueItemId });
  assert.equal(currentQueueItem(closed), null);
  assert.deepEqual(closed.items, []);
  assert.equal(closed.source, null);
  assert.equal(closed.index, -1);
  const only = start([a]);
  assert.equal(currentQueueItem(reduce(only, { type: 'remove', queueItemId: only.items[0].queueItemId })), null);
});

test('clear upcoming preserves current/history and Off stops even for collections', () => {
  for (const index of [0, 1, 2]) {
    const state = start(undefined, index);
    const cleared = reduce(state, { type: 'clearUpcoming' });
    unchangedMedia(state, cleared);
    assert.equal(cleared.items.length, index + 1);
    assert.equal(cleared.source, 'manual');
    assert.equal(canAdvanceQueue(cleared), false);
    assert.equal(reduce(cleared, { type: 'next' }), cleared);
  }
});

test('reordering only upcoming occurrences preserves media and plays the requested order', () => {
  const state = start();
  const moved = reduce(state, { type: 'moveUpcoming', queueItemId: state.items[2].queueItemId, toIndex: 0 });
  unchangedMedia(state, moved);
  assert.deepEqual(ids(moved), [a.id, c.id, b.id]);
  assert.deepEqual(ids(state), [a.id, b.id, c.id]);
  assert.equal(currentQueueItem(reduce(moved, { type: 'next' }))?.track, c);
  const movedBack = reduce(moved, { type: 'moveUpcoming', queueItemId: state.items[2].queueItemId, toIndex: 1 });
  assert.deepEqual(ids(movedBack), ids(state));
  for (const [queueItemId, toIndex] of [
    [state.items[0].queueItemId, 0], ['missing', 0], [state.items[1].queueItemId, -1],
    [state.items[1].queueItemId, 2], [state.items[1].queueItemId, NaN],
    [state.items[1].queueItemId, 0.5], [state.items[1].queueItemId, 0],
  ] as const) {
    assert.equal(reduce(state, { type: 'moveUpcoming', queueItemId, toIndex }), state);
  }
});

test('Off never wraps even when replacing a manual queue with a collection', () => {
  const state = reduce(initialQueueState, { type: 'append', tracks: [b, c] });
  assert.equal(currentQueueItem(reduce(state, { type: 'previous' }))?.track, b);
  const next = reduce(state, { type: 'next' });
  assert.equal(currentQueueItem(reduce(next, { type: 'previous' }))?.track, b);
  const collection = reduce(next, { type: 'replace', tracks: [a, c], source: 'collection', startIndex: 1 });
  assert.equal(collection.source, 'collection');
  assert.deepEqual(ids(collection), [a.id, c.id]);
  assert.equal(reduce(collection, { type: 'next' }), collection);
  assert.equal(reduce(collection, { type: 'ended' }), collection);
});

test('Play next inserts after current with fresh IDs and preserves history, upcoming and media', () => {
  const state = start(undefined, 1);
  const inserted = reduce(state, { type: 'playNext', tracks: [a, b] });
  unchangedMedia(state, inserted);
  assert.deepEqual(ids(inserted), [a.id, b.id, a.id, b.id, c.id]);
  assert.equal(inserted.items[0], state.items[0]);
  assert.equal(inserted.items[4], state.items[2]);
  assert.equal(new Set(inserted.items.map(item => item.queueItemId)).size, 5);
  const again = reduce(inserted, { type: 'playNext', tracks: [c] });
  assert.deepEqual(ids(again), [a.id, b.id, c.id, a.id, b.id, c.id]);
  unchangedMedia(inserted, again);
  assert.equal(currentQueueItem(reduce(again, { type: 'next' }))?.track, c);
  const empty = reduce(initialQueueState, { type: 'playNext', tracks: [b, a] });
  assert.equal(currentQueueItem(empty)?.track, b);
  assert.equal(empty.source, 'manual');
  const tail = start(undefined, 2);
  unchangedMedia(tail, reduce(tail, { type: 'playNext', tracks: [a] }));
});

test('Repeat one replays only on ended; manual Next and Previous navigate normally', () => {
  for (const index of [0, 1, 2]) {
    const state = start(undefined, index);
    const one = reduce(state, { type: 'setRepeat', mode: 'one' });
    unchangedMedia(state, one);
    const ended = reduce(one, { type: 'ended' });
    assert.equal(currentQueueItem(ended), currentQueueItem(one));
    assert.equal(ended.playbackRevision, one.playbackRevision + 1);
    const next = reduce(one, { type: 'next' });
    assert.equal(next.index, Math.min(index + 1, 2));
    assert.equal(canAdvanceQueue(one), index < 2);
    assert.equal(reduce(one, { type: 'previous' }).index, Math.max(index - 1, 0));
    const off = reduce(one, { type: 'setRepeat', mode: 'off' });
    unchangedMedia(one, off);
    assert.equal(reduce(off, { type: 'ended' }).index, Math.min(index + 1, 2));
  }
});

test('repeat is explicit across sources, edits, replacements and close within a session', () => {
  for (const mode of ['off', 'one', 'all'] as const) {
    let state = reduce(start(), { type: 'setRepeat', mode });
    for (const action of [
      { type: 'append', tracks: [a] }, { type: 'playNext', tracks: [b] },
      { type: 'moveUpcoming', queueItemId: state.items[2].queueItemId, toIndex: 0 },
      { type: 'remove', queueItemId: state.items[1].queueItemId }, { type: 'clearUpcoming' },
    ] as const) {
      const next = reduce(state, action as Parameters<typeof reduce>[1]);
      unchangedMedia(state, next);
      assert.equal(next.repeatMode, mode);
      state = next;
    }
    assert.equal(state.items.length, 1);
    assert.equal(reduce(state, { type: 'ended' }).playbackRevision, state.playbackRevision + (mode === 'off' ? 0 : 1));
    for (const source of ['single', 'collection'] as const) {
      state = reduce(state, { type: 'replace', tracks: [c], source });
      assert.equal(state.repeatMode, mode);
    }
    assert.equal(reduce(state, { type: 'close' }).repeatMode, mode);
  }
});

test('close drops all queue state, keeps IDs fresh and leaves input song metadata untouched', () => {
  const tracks = [Object.freeze({ ...a, animeTitles: { anime_name_romaji: 'Romaji' } }), b];
  const before = JSON.stringify(tracks);
  const state = start(tracks);
  const closed = reduce(state, { type: 'close' });
  const restarted = reduce(closed, { type: 'append', tracks });
  assert.equal(closed.items.length, 0);
  assert.equal(closed.index, -1);
  assert.notEqual(restarted.items[0].queueItemId, state.items[0].queueItemId);
  assert.equal(JSON.stringify(tracks), before);
});

test('start positions are clamped and normalized', () => {
  for (const [input, expected] of [[-1, 0], [99, 2], [1.9, 1], [NaN, 0], [Infinity, 0]]) {
    assert.equal(start(undefined, input).index, expected);
  }
});
