import type { AnimeSongEntry, AnimeSongItem, NoteSongSnapshot } from '../types';
import { createNoteSongSnapshot } from './notesStorage';
import { reorderSongSubset } from './songOrder';

export const PLAYLISTS_STORAGE_KEY = 'anime-db:playlists';
export const SAVED_SONGS_ID = 'saved-songs';
export const PLAYLIST_NAME_LIMIT = 80;

// Catalog identity is independent of saved numbers and playback occurrences.
// Manual songs carry their own UUID and snapshot. Reuse the reference when
// assigning the same manual song to another playlist; never use its saved ID.
export type PlaylistSongReference =
  | { songId: string; source: 'anisongdb' | 'animethemes'; snapshot?: NoteSongSnapshot }
  | { songId: string; source: 'local'; snapshot: NoteSongSnapshot };

export interface CustomPlaylist {
  id: string;
  name: string;
  songs: PlaylistSongReference[];
}

interface PlaylistLibrary { version: 1; playlists: CustomPlaylist[] }
type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>;

export function createSongReference(
  song: AnimeSongEntry | AnimeSongItem | NoteSongSnapshot,
): PlaylistSongReference {
  const snapshot = structuredClone(createNoteSongSnapshot(song));
  const sourceId = 'source_song_id' in song ? song.source_song_id : undefined;
  const source = 'source' in song ? song.source : undefined;
  if (sourceId !== undefined || source === 'anisongdb' || source === 'animethemes' || (source !== 'collection' && typeof song.id === 'string')) {
    return { songId: String(sourceId ?? song.id), source: source === 'animethemes' ? 'animethemes' : 'anisongdb', snapshot };
  }
  return { songId: ('local_song_id' in song && song.local_song_id) || crypto.randomUUID(), source: 'local', snapshot };
}

export function songReferenceKey(ref: Pick<PlaylistSongReference, 'source' | 'songId'>): string {
  return JSON.stringify([ref.source, ref.songId]);
}

/** Resolve exact catalog identity, then the independent saved snapshot. Never guess by title. */
export function resolvePlaylistSong(ref: PlaylistSongReference, catalog: AnimeSongItem[]): NoteSongSnapshot {
  const match = ref.source === 'local' ? undefined : catalog.find((song) =>
    String(song.id) === ref.songId && (song.source ?? 'anisongdb') === ref.source);
  return match ? { ...ref.snapshot, ...match } : ref.snapshot ?? {
    id: ref.songId, source: ref.source === 'local' ? 'collection' : ref.source,
    anime_name: 'Unknown anime', song_name: `Unavailable song (${ref.songId})`, artist: '', anime_year: 0,
  };
}

export function validatePlaylistName(name: string, playlists: CustomPlaylist[], exceptId?: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Enter a playlist name.');
  if (trimmed.length > PLAYLIST_NAME_LIMIT) throw new Error(`Use ${PLAYLIST_NAME_LIMIT} characters or fewer.`);
  const key = trimmed.toLowerCase();
  if (key === 'saved songs') throw new Error('Saved Songs is reserved for your built-in playlist.');
  if (playlists.some((list) => list.id !== exceptId && list.name.toLowerCase() === key)) {
    throw new Error('A playlist with this name already exists.');
  }
  return trimmed;
}

function isSongReference(value: unknown): value is PlaylistSongReference {
  if (!value || typeof value !== 'object') return false;
  const ref = value as PlaylistSongReference;
  if (typeof ref.songId !== 'string' || !ref.songId.trim()) return false;
  if (!['anisongdb', 'animethemes', 'local'].includes(ref.source)) return false;
  if (ref.snapshot === undefined) return ref.source !== 'local';
  const song = ref.snapshot;
  return Boolean(song && (typeof song.id === 'string' || typeof song.id === 'number') &&
    typeof song.anime_name === 'string' && typeof song.song_name === 'string' &&
    typeof song.artist === 'string' && Number.isFinite(song.anime_year) &&
    ['theme_type', 'anime_name_english', 'anime_name_romaji'].every((key) =>
      song[key] === undefined || typeof song[key] === 'string') &&
    ['video_url', 'audio_url'].every((key) =>
      song[key] === undefined || song[key] === null || typeof song[key] === 'string') &&
    (song.anime_alt_names === undefined || (Array.isArray(song.anime_alt_names) && song.anime_alt_names.every((name) => typeof name === 'string'))) &&
    (song.anilist_id === undefined || song.anilist_id === null || Number.isFinite(song.anilist_id)) &&
    (song.source === undefined || ['anisongdb', 'animethemes', 'collection'].includes(song.source)));
}

/** Shared strict validation for storage and imports; never discard broken memberships. */
export function validatePlaylists(value: unknown): CustomPlaylist[] {
  if (!Array.isArray(value)) throw new Error('Backup must contain a playlists array.');
  const ids = new Set<string>();
  const checked: CustomPlaylist[] = [];
  for (const list of value) {
    if (!list || typeof list.id !== 'string' || !list.id.trim() || list.id === SAVED_SONGS_ID || ids.has(list.id) ||
        typeof list.name !== 'string' || !Array.isArray(list.songs) || !list.songs.every(isSongReference)) {
      throw new Error('Invalid playlist identity or song reference.');
    }
    if (validatePlaylistName(list.name, checked) !== list.name) throw new Error('Invalid playlist name.');
    if (new Set(list.songs.map(songReferenceKey)).size !== list.songs.length) throw new Error('A playlist contains duplicate song references.');
    ids.add(list.id);
    checked.push(list);
  }
  return structuredClone(checked);
}

export function loadPlaylists(storage: StorageAccess = localStorage): CustomPlaylist[] {
  let raw: string | null;
  try { raw = storage.getItem(PLAYLISTS_STORAGE_KEY); }
  catch { throw new Error('Could not read playlists. Allow this browser to access site data, then retry.'); }
  if (raw === null) return [];
  try {
    const data = JSON.parse(raw) as PlaylistLibrary;
    if (data?.version !== 1 || !Array.isArray(data.playlists)) throw new Error();
    return validatePlaylists(data.playlists);
  } catch {
    // Never silently replace unreadable or newer data with an empty library.
    throw new Error('Stored playlists could not be read. Your existing playlist data has been kept.');
  }
}

export type PlaylistChange =
  | { type: 'create'; name: string; song?: PlaylistSongReference }
  | { type: 'rename'; id: string; name: string }
  | { type: 'delete'; id: string }
  | { type: 'deleteMany'; ids: string[] }
  | { type: 'addSong'; id: string; song: PlaylistSongReference }
  | { type: 'removeSong'; id: string; songKey: string }
  | { type: 'reorderSongs'; id: string; songKeys: string[] }
  | { type: 'moveSong'; id: string; songKey: string; direction: -1 | 1 };

export function changePlaylists(change: PlaylistChange, storage: StorageAccess = localStorage): CustomPlaylist[] {
  // Read at the moment of mutation so another tab's latest changes are retained.
  const lists = loadPlaylists(storage);
  let next: CustomPlaylist[];
  if (change.type === 'create') {
    const name = validatePlaylistName(change.name, lists);
    if (change.song && !isSongReference(change.song)) throw new Error('This song could not be added.');
    next = [...lists, { id: crypto.randomUUID(), name, songs: change.song ? [structuredClone(change.song)] : [] }];
  } else if (change.type === 'deleteMany') {
    const ids = new Set(change.ids);
    if (!ids.size) throw new Error('Select at least one playlist.');
    if (ids.has(SAVED_SONGS_ID)) throw new Error('Saved Songs cannot be deleted.');
    if ([...ids].some((id) => !lists.some((list) => list.id === id))) {
      throw new Error('A selected playlist no longer exists. Close this dialog and select playlists again.');
    }
    next = lists.filter((list) => !ids.has(list.id));
  } else {
    if (change.id === SAVED_SONGS_ID) throw new Error('Saved Songs cannot be renamed or deleted.');
    if (!lists.some((list) => list.id === change.id)) throw new Error('This playlist no longer exists. Close this dialog and try again.');
    if (change.type === 'delete') next = lists.filter((list) => list.id !== change.id);
    else if (change.type === 'rename') {
      const name = validatePlaylistName(change.name, lists, change.id);
      next = lists.map((list) => list.id === change.id ? { ...list, name } : list);
    } else {
      next = lists.map((list) => {
        if (list.id !== change.id) return list;
        if (change.type === 'reorderSongs') {
          return { ...list, songs: reorderSongSubset<PlaylistSongReference>(list.songs, change.songKeys, songReferenceKey) };
        }
        if (change.type === 'addSong') {
          if (!isSongReference(change.song)) throw new Error('This song could not be added.');
          if (list.songs.some((song) => songReferenceKey(song) === songReferenceKey(change.song))) return list;
          return { ...list, songs: [...list.songs, structuredClone(change.song)] };
        }
        const index = list.songs.findIndex((song) => songReferenceKey(song) === change.songKey);
        if (index < 0) throw new Error('This song is no longer in the playlist.');
        if (change.type === 'removeSong') return { ...list, songs: list.songs.filter((_, i) => i !== index) };
        const target = index + change.direction;
        if ((change.direction !== -1 && change.direction !== 1) || target < 0 || target >= list.songs.length) return list;
        const songs = [...list.songs];
        [songs[index], songs[target]] = [songs[target], songs[index]];
        return { ...list, songs };
      });
    }
  }
  try { storage.setItem(PLAYLISTS_STORAGE_KEY, JSON.stringify({ version: 1, playlists: next } satisfies PlaylistLibrary)); }
  catch { throw new Error('Could not save playlists. Check that this browser allows saving site data, then try again.'); }
  return next;
}
