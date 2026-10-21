import assert from 'node:assert/strict';
import test from 'node:test';
import type { AnimeSongEntry, AnimeSongItem } from '../types';
import { toSongTrack } from '../utils/player';

const catalogSong: AnimeSongItem = {
  id: 'song-34831', anime_name: 'The Heike Story', anime_year: 2021,
  song_name: 'unified perspective', artist: 'agraph', anilist_id: 138714,
  video_url: 'https://example.com/correct.webm', audio_url: 'https://example.com/correct.mp3',
};
const saved: AnimeSongEntry = {
  id: 7, source_song_id: catalogSong.id, anime_name: 'Edited anime title', anime_year: 2021,
  song_name: 'Edited song title', artist: 'Edited artist',
};

test('saved playback recovers media by exact source identity despite edited metadata', () => {
  const before = structuredClone(saved);
  const track = toSongTrack(saved, 'collection', catalogSong)!;
  assert.equal(track.videoUrl, catalogSong.video_url);
  assert.equal(track.anilistId, catalogSong.anilist_id);
  assert.equal(track.id, 'collection:7');
  assert.equal(track.songName, saved.song_name);
  assert.deepEqual(track.actionSong, before);
  assert.deepEqual(saved, before, 'media recovery never rewrites saved data');
  assert.equal(toSongTrack(saved, 'collection', { ...catalogSong, video_url: null })?.videoUrl, catalogSong.audio_url);
});

test('same anime or matching metadata cannot substitute a different catalog song', () => {
  assert.equal(toSongTrack(saved, 'collection', { ...catalogSong, id: 'song-34830' }), null);
  const { source_song_id, ...manual } = saved;
  assert.equal(toSongTrack(manual, 'collection', catalogSong), null);
  assert.equal(toSongTrack({ ...saved, source_song_id: 'missing-song' }, 'collection', catalogSong), null);
  assert.equal(toSongTrack(saved, 'collection'), null);
});

test('existing saved media remains playable independently of catalog availability', () => {
  const ownMedia = { ...saved, audio_url: 'https://example.com/saved.mp3' };
  assert.equal(toSongTrack(ownMedia, 'collection', catalogSong)?.videoUrl, ownMedia.audio_url);
  assert.equal(toSongTrack(ownMedia, 'collection')?.videoUrl, ownMedia.audio_url);
  const { source_song_id, ...manual } = ownMedia;
  assert.equal(toSongTrack(manual, 'collection', catalogSong)?.anilistId, undefined);
});
