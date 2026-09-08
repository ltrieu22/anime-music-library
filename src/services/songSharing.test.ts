import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicSongId, resolveSharedSong, shareSongLink, songShareUrl } from './songSharing';
import type { AnimeSongItem } from '../types';

test('share identity uses exact catalog IDs and saved source IDs, never local IDs or metadata', () => {
  assert.equal(publicSongId({ id: 'song-34830' }), 'song-34830');
  assert.equal(publicSongId({ id: 123, source_song_id: 'song-34830' }), 'song-34830');
  for (const song of [{ id: 34830 }, { id: 'collection:34830' }, { id: 'local-34830' }, { id: 'song-2', source_song_id: 'custom' }]) {
    assert.equal(publicSongId(song), null);
  }
});
test('song links omit search text and preserve deployment path and unrelated URL state', () => {
  const base = new URL('https://example.com/anime_db/?q=private+note+query&page=3&theme=ED&play=old&x=1#songs');
  assert.equal(songShareUrl({ id: 1, source_song_id: 'song-34830' }, base), 'https://example.com/anime_db/?play=song-34830&x=1#songs');
  assert.equal(songShareUrl({ id: 1 }, base), null);
  assert.equal(base.searchParams.get('q'), 'private note query');
});
test('shared songs resolve from the full catalog, including audio-only songs, with explicit failures', () => {
  const song: AnimeSongItem = { id: 'song-34830', anime_name: 'Heike', anime_year: 2021, artist: 'Artist', song_name: 'Song', audio_url: 'audio.mp3' };
  assert.equal(resolveSharedSong('song-34830', [song]), song);
  assert.throws(() => resolveSharedSong('', [song]), /invalid song ID/);
  assert.throws(() => resolveSharedSong('song-1', [song]), /no longer/);
  assert.throws(() => resolveSharedSong('song-34830', [{ ...song, audio_url: '' }]), /no playable media/);
  assert.throws(() => resolveSharedSong('song-34830', []), /catalog could not be loaded/);
});
test('native sharing success and cancellation never write clipboard', async () => {
  let copies = 0;
  let sharedTitle = '';
  const clipboard = { writeText: async () => { copies++; } };
  assert.equal(await shareSongLink('https://example.com/?play=song-1', {
    clipboard, share: async data => { assert.equal(data.url, 'https://example.com/?play=song-1'); sharedTitle = data.title || ''; },
  }, false, 'Anime catalog search'), 'shared');
  assert.equal(sharedTitle, 'Anime catalog search');
  assert.equal(await shareSongLink('link', { clipboard, share: async () => { throw new DOMException('Cancelled', 'AbortError'); } }), 'cancelled');
  assert.equal(copies, 0);
});
test('unavailable or failed native sharing falls back to clipboard, then a selectable link', async () => {
  let copied = '';
  const clipboard = { writeText: async (value: string) => { copied = value; } };
  assert.equal(await shareSongLink('link', { clipboard }), 'copied');
  assert.equal(copied, 'link');
  assert.equal(await shareSongLink('link', { clipboard, share: async () => { throw new Error('Denied'); } }), 'copied');
  assert.equal(await shareSongLink('link', {}), 'manual');
  assert.equal(await shareSongLink('link', { clipboard: { writeText: async () => { throw new Error('Denied'); } } }), 'manual');
  assert.equal(await shareSongLink('copy', { clipboard, share: async () => { throw new Error('Must not share'); } }, true), 'copied');
  assert.equal(copied, 'copy');
});
