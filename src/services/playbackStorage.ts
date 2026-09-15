import type { PlayerActionSong, SongTrack } from '../types/player';
import { copyAnimeTitleMetadata } from './animeTitles';
import { initialQueueState, type QueueState } from './playerQueue';

export const PLAYER_SESSION_KEY = 'anime-db:player-session-v1';
export const RECENT_SONGS_KEY = 'anime-db:recent-songs-v1';
export const RECENT_SONGS_LIMIT = 100;
export interface RecentSong { track: SongTrack; playedAt: number }
interface ReadResult<T> { value: T; notice: string }
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const identity = (value: unknown): value is string | number =>
  (typeof value === 'string' && value.trim().length > 0) || (typeof value === 'number' && Number.isFinite(value));

/** Temporary blob URLs cannot survive a browser restart. Never restore executable URLs. */
export function persistentMediaUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const url = value.trim();
  if (!url || /[\u0000-\u0020]/.test(url)) return '';
  if (/^https?:\/\//i.test(url)) {
    try { const parsed = new URL(url); return parsed.hostname && !parsed.username && !parsed.password ? url : ''; }
    catch { return ''; }
  }
  return !url.startsWith('//') && !url.includes(':') ? url : '';
}

/** Copy only known song fields, retaining catalog and custom identities separately. */
function readActionSong(value: unknown): PlayerActionSong | undefined {
  if (!record(value) || !identity(value.id) || typeof value.anime_name !== 'string') return;
  const song: Record<string, unknown> = {
    id: value.id, anime_name: value.anime_name,
    anime_year: typeof value.anime_year === 'number' && Number.isFinite(value.anime_year) ? value.anime_year : 0,
    song_name: typeof value.song_name === 'string' ? value.song_name : '',
    artist: typeof value.artist === 'string' ? value.artist : '',
    ...copyAnimeTitleMetadata(value),
  };
  for (const key of ['local_song_id', 'theme_type', 'anime_vintage', 'anime_season'] as const) {
    if (typeof value[key] === 'string') song[key] = value[key];
  }
  if (identity(value.source_song_id)) song.source_song_id = value.source_song_id;
  if (typeof value.anilist_id === 'number' && Number.isFinite(value.anilist_id)) song.anilist_id = value.anilist_id;
  if (['anisongdb', 'animethemes', 'collection'].includes(String(value.source))) song.source = value.source;
  for (const key of ['video_url', 'audio_url'] as const) {
    const url = persistentMediaUrl(value[key]);
    if (url) song[key] = url;
  }
  return song as unknown as PlayerActionSong;
}

export function readStoredTrack(value: unknown): SongTrack | null {
  if (!record(value) || !identity(value.id) || typeof value.animeTitle !== 'string' || !value.animeTitle.trim()) return null;
  const track: SongTrack = { id: value.id, animeTitle: value.animeTitle, videoUrl: persistentMediaUrl(value.videoUrl) };
  for (const key of ['songName', 'artist', 'type'] as const) {
    if (typeof value[key] === 'string') track[key] = value[key];
  }
  if (typeof value.anilistId === 'number' && Number.isFinite(value.anilistId)) track.anilistId = value.anilistId;
  if (typeof value.image === 'string' && /^https?:\/\//i.test(value.image)) track.image = persistentMediaUrl(value.image);
  if (record(value.animeTitles)) {
    track.animeTitles = { ...copyAnimeTitleMetadata(value.animeTitles), anime_name: value.animeTitle };
    for (const key of ['id', 'source_song_id'] as const) {
      if (identity(value.animeTitles[key])) track.animeTitles[key] = value.animeTitles[key];
    }
  }
  track.actionSong = readActionSong(value.actionSong);
  return track;
}

function readVersioned(key: string): Record<string, unknown> | null {
  const raw = globalThis.localStorage?.getItem(key);
  if (!raw) return null;
  const value: unknown = JSON.parse(raw);
  if (!record(value) || value.version !== 1) throw new Error('Unsupported saved playback data');
  return value;
}

export function readPlayerSession(): ReadResult<{ queue: QueueState; position: number }> {
  const empty = { queue: initialQueueState, position: 0 };
  try {
    const saved = readVersioned(PLAYER_SESSION_KEY);
    if (!saved) return { value: empty, notice: '' };
    if (!Array.isArray(saved.items) || saved.items.length > 50_000 || !Number.isInteger(saved.index) ||
        (saved.items.length > 0 && ((saved.index as number) < 0 || (saved.index as number) >= saved.items.length))) throw new Error('Invalid queue');
    const ids = new Set<string>();
    const retained = saved.items.flatMap((item, originalIndex) => {
      if (!record(item)) return [];
      const track = readStoredTrack(item.track);
      if (!track?.videoUrl) return [];
      let queueItemId = typeof item.queueItemId === 'string' && /^(queue:\d+|restored:\d+(?::\d+)?)$/.test(item.queueItemId) ? item.queueItemId : '';
      const numericId = queueItemId.startsWith('queue:') ? Number(queueItemId.slice(6)) : 0;
      if (!queueItemId || ids.has(queueItemId) || !Number.isSafeInteger(numericId) || numericId > Number.MAX_SAFE_INTEGER - 50_000) {
        queueItemId = `restored:${originalIndex}`;
        let suffix = 0;
        while (ids.has(queueItemId)) queueItemId = `restored:${originalIndex}:${++suffix}`;
      }
      ids.add(queueItemId);
      return [{ queueItemId, track, originalIndex }];
    });
    const skipped = retained.length !== saved.items.length;
    if (!retained.length) return { value: empty, notice: skipped ? 'Saved queue has no available media. Choose another song.' : '' };
    const requested = saved.index as number;
    const successor = retained.findIndex(item => item.originalIndex >= requested);
    const index = successor < 0 ? retained.length - 1 : successor;
    const sameCurrent = retained[index].originalIndex === requested;
    const nextItemId = retained.reduce((maximum, item) => Math.max(maximum, item.queueItemId.startsWith('queue:') ? Number(item.queueItemId.slice(6)) : 0), 0) + 1;
    return {
      value: {
        queue: { ...initialQueueState, items: retained.map(({ queueItemId, track }) => ({ queueItemId, track })), index,
          nextItemId, source: ['single', 'collection', 'manual'].includes(String(saved.source)) ? saved.source as QueueState['source'] : 'manual',
          repeatMode: saved.repeatMode === 'one' || saved.repeatMode === 'all' ? saved.repeatMode : 'off' },
        position: sameCurrent && typeof saved.position === 'number' && Number.isFinite(saved.position) ? Math.max(0, saved.position) : 0,
      },
      notice: skipped ? 'Queue restored paused. Unavailable saved media was skipped.' : 'Queue restored paused. Press Play to continue.',
    };
  } catch { return { value: empty, notice: 'Saved queue could not be read. You can start a new queue.' }; }
}

export function recentSongKey(track: SongTrack): string {
  const song = track.actionSong;
  if (song && 'source_song_id' in song && identity(song.source_song_id)) return `catalog:${song.source_song_id}`;
  if (song && 'local_song_id' in song && song.local_song_id) return `local:${song.local_song_id}`;
  // Catalog and note snapshots share public IDs; custom IDs remain source-qualified.
  if (song && typeof song.id === 'string' && song.id.startsWith('song-')) return `catalog:${song.id}`;
  return String(track.id);
}

export function addRecentSong(history: RecentSong[], track: SongTrack, playedAt = Date.now()): RecentSong[] {
  const key = recentSongKey(track);
  return [{ track, playedAt }, ...history.filter(item => recentSongKey(item.track) !== key)].slice(0, RECENT_SONGS_LIMIT);
}

export function readRecentSongs(): ReadResult<RecentSong[]> {
  try {
    const saved = readVersioned(RECENT_SONGS_KEY);
    if (!saved) return { value: [], notice: '' };
    if (!Array.isArray(saved.items)) throw new Error('Invalid history');
    const items = saved.items.flatMap(item => {
      if (!record(item) || typeof item.playedAt !== 'number' || !Number.isFinite(item.playedAt) || item.playedAt < 0 || item.playedAt > 8.64e15) return [];
      const track = readStoredTrack(item.track);
      return track ? [{ track, playedAt: item.playedAt }] : [];
    }).sort((a, b) => a.playedAt - b.playedAt);
    return { value: items.reduce((history, item) => addRecentSong(history, item.track, item.playedAt), [] as RecentSong[]), notice: '' };
  } catch { return { value: [], notice: 'Recent songs could not be read. New listening history will start here.' }; }
}

function writeVersioned(key: string, value: Record<string, unknown>): void {
  if (!globalThis.localStorage) throw new Error('Browser storage unavailable');
  globalThis.localStorage.setItem(key, JSON.stringify({ version: 1, ...value }));
}

export function writePlayerSession(queue: QueueState, position: number): void {
  if (!globalThis.localStorage) throw new Error('Browser storage unavailable');
  if (!queue.items.length) { globalThis.localStorage.removeItem(PLAYER_SESSION_KEY); return; }
  writeVersioned(PLAYER_SESSION_KEY, { items: queue.items.map(item => ({ ...item, track: readStoredTrack(item.track) })),
    index: queue.index, source: queue.source, repeatMode: queue.repeatMode, position: Number.isFinite(position) ? Math.max(0, position) : 0 });
}

export function writeRecentSongs(items: RecentSong[]): void {
  writeVersioned(RECENT_SONGS_KEY, { items: items.slice(0, RECENT_SONGS_LIMIT).map(item => ({ ...item, track: readStoredTrack(item.track) })) });
}
