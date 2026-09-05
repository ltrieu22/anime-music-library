import type {
  AnimeSongEntry,
  AnimeSongItem,
  NoteMap,
  NoteSongSnapshot,
  PersonalSongNote,
} from '../types';
import { copyAnimeTitleMetadata } from './animeTitles';

export const NOTES_STORAGE_KEY = 'anime_song_notes_v1';
export const NOTES_STORAGE_VERSION = 1;
export const MAX_NOTE_LENGTH = 5_000;

type NoteableSong = AnimeSongEntry | AnimeSongItem | NoteSongSnapshot;

interface StoredNotesV1 {
  version: typeof NOTES_STORAGE_VERSION;
  notes: NoteMap;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getBrowserStorage(): Storage | null {
  try {
    if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
      return null;
    }
    return globalThis.localStorage;
  } catch {
    // Access itself can throw when storage is disabled by the browser.
    return null;
  }
}

function normalizeIdentifier(value: string | number): string {
  return String(value).trim();
}

function isSafeNoteKey(value: string): boolean {
  return value !== '__proto__' && value !== 'prototype' && value !== 'constructor';
}

function getSourceSongId(song: NoteableSong): string | number | undefined {
  if ('source_song_id' in song) {
    const value = song.source_song_id;
    if ((typeof value === 'string' && value.trim()) || (typeof value === 'number' && Number.isFinite(value))) {
      return value;
    }
  }
  return undefined;
}

/**
 * Resolve the same key for a catalog song and a collection copy carrying its
 * source_song_id. Manually-added collection entries remain scoped to their
 * collection id.
 */
export function getSongNoteKey(song: NoteableSong): string {
  const sourceSongId = getSourceSongId(song);
  if (sourceSongId !== undefined) {
    return `catalog:${normalizeIdentifier(sourceSongId)}`;
  }

  const id = normalizeIdentifier(song.id);
  const source = 'source' in song ? song.source : undefined;
  if (source === 'anisongdb' || source === 'animethemes') {
    return `catalog:${id}`;
  }
  if (source === 'collection') {
    return `collection:${id}`;
  }

  // Catalog records use stable string ids (for example "song-47505"), while
  // local collection ids are numeric. Explicit `source` above handles numeric
  // ids returned by other catalog providers.
  return typeof song.id === 'string' ? `catalog:${id}` : `collection:${id}`;
}

export function createNoteSongSnapshot(song: NoteableSong): NoteSongSnapshot {
  const sourceSongId = getSourceSongId(song);
  const explicitSource = 'source' in song ? song.source : undefined;
  const inferredSource = sourceSongId !== undefined
    ? 'anisongdb'
    : explicitSource ?? (typeof song.id === 'string' ? 'anisongdb' : 'collection');

  return {
    id: sourceSongId ?? song.id,
    ...copyAnimeTitleMetadata(song),
    anime_name: String(song.anime_name || ''),
    anime_year: Number(song.anime_year) || 0,
    artist: String(song.artist || ''),
    song_name: String(song.song_name || ''),
    ...(song.theme_type !== undefined ? { theme_type: song.theme_type } : {}),
    ...(song.video_url !== undefined ? { video_url: song.video_url } : {}),
    ...('audio_url' in song && song.audio_url !== undefined ? { audio_url: song.audio_url } : {}),
    ...('anilist_id' in song && song.anilist_id !== undefined ? { anilist_id: song.anilist_id } : {}),
    source: inferredSource,
  };
}

function normalizeMetadataPart(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Used only as a compatibility fallback for older collection copies. */
export function getSongMetadataFingerprint(song: NoteableSong): string {
  return [
    normalizeMetadataPart(song.anime_name),
    normalizeMetadataPart(song.anime_year),
    normalizeMetadataPart(song.artist),
    normalizeMetadataPart(song.song_name),
  ].join('\u001f');
}

function canUseMetadataFallback(song: NoteableSong): boolean {
  return Boolean(
    normalizeMetadataPart(song.anime_name)
    && (normalizeMetadataPart(song.song_name) || normalizeMetadataPart(song.artist)),
  );
}

function sanitizeSnapshot(value: unknown): NoteSongSnapshot | null {
  if (!isRecord(value)) return null;

  const id = value.id;
  if (!((typeof id === 'string' && id.trim()) || (typeof id === 'number' && Number.isFinite(id)))) {
    return null;
  }

  const source = value.source;
  const validSource = source === 'anisongdb' || source === 'animethemes' || source === 'collection'
    ? source
    : undefined;
  const year = Number(value.anime_year);
  const anilistId = value.anilist_id === null ? null : Number(value.anilist_id);
  const videoUrl = value.video_url;
  const audioUrl = value.audio_url;

  const snapshot: NoteSongSnapshot = {
    ...copyAnimeTitleMetadata(value),
    id,
    anime_name: String(value.anime_name ?? ''),
    anime_year: Number.isFinite(year) ? year : 0,
    artist: String(value.artist ?? ''),
    song_name: String(value.song_name ?? ''),
  };
  if (typeof value.theme_type === 'string') snapshot.theme_type = value.theme_type;
  if (typeof videoUrl === 'string' || videoUrl === null) snapshot.video_url = videoUrl as string | null;
  if (typeof audioUrl === 'string' || audioUrl === null) snapshot.audio_url = audioUrl as string | null;
  if (value.anilist_id === null || Number.isFinite(anilistId)) snapshot.anilist_id = anilistId;
  if (validSource) snapshot.source = validSource;
  return snapshot;
}

function sanitizeNotes(value: unknown): NoteMap {
  if (!isRecord(value)) return {};

  const notes: NoteMap = {};
  for (const [recordKey, candidate] of Object.entries(value)) {
    if (!isRecord(candidate) || typeof candidate.text !== 'string' || !candidate.text.trim()) {
      continue;
    }

    const song = sanitizeSnapshot(candidate.song);
    if (!song) continue;

    const candidateKey = typeof candidate.songKey === 'string' && candidate.songKey.trim()
      ? candidate.songKey.trim()
      : recordKey.trim();
    if (!candidateKey || !isSafeNoteKey(candidateKey)) continue;

    const updatedAt = typeof candidate.updatedAt === 'string' && !Number.isNaN(Date.parse(candidate.updatedAt))
      ? candidate.updatedAt
      : new Date(0).toISOString();

    notes[candidateKey] = {
      songKey: candidateKey,
      text: candidate.text.trim().slice(0, MAX_NOTE_LENGTH),
      updatedAt,
      song,
    };
  }
  return notes;
}

export function loadNotes(): NoteMap {
  const storage = getBrowserStorage();
  if (!storage) return {};

  try {
    const raw = storage.getItem(NOTES_STORAGE_KEY);
    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};

    // Current envelope, plus a raw-map fallback for early/local prototypes.
    if (parsed.version === NOTES_STORAGE_VERSION && 'notes' in parsed) {
      return sanitizeNotes(parsed.notes);
    }
    if (!('version' in parsed) && !('notes' in parsed)) {
      return sanitizeNotes(parsed);
    }
  } catch (error) {
    console.warn('Could not read personal song notes from localStorage', error);
  }
  return {};
}

export function saveNotes(notes: NoteMap): boolean {
  const storage = getBrowserStorage();
  if (!storage) return false;

  const payload: StoredNotesV1 = {
    version: NOTES_STORAGE_VERSION,
    notes: sanitizeNotes(notes),
  };

  try {
    storage.setItem(NOTES_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch (error) {
    console.warn('Could not save personal song notes to localStorage', error);
    return false;
  }
}

export function findNoteForSong(notes: NoteMap, song: NoteableSong): PersonalSongNote | undefined {
  const exactKey = getSongNoteKey(song);
  const exact = Object.prototype.hasOwnProperty.call(notes, exactKey) ? notes[exactKey] : undefined;
  if (exact) return exact;
  if (!canUseMetadataFallback(song)) return undefined;

  const fingerprint = getSongMetadataFingerprint(song);
  return Object.values(notes).find((note) => getSongMetadataFingerprint(note.song) === fingerprint);
}

export function upsertNote(notes: NoteMap, song: NoteableSong, text: string): NoteMap {
  const normalizedText = text.trim().slice(0, MAX_NOTE_LENGTH);
  if (!normalizedText) {
    return clearNote(notes, song);
  }

  const exactKey = getSongNoteKey(song);
  const matched = findNoteForSong(notes, song);
  // Prefer a catalog identity whenever either side has one. This upgrades old
  // collection-only notes without duplicating them and keeps catalog media/id
  // metadata when a note is later edited from My Collection.
  const songKey = exactKey.startsWith('catalog:')
    ? exactKey
    : matched?.songKey ?? exactKey;
  const incomingSnapshot = createNoteSongSnapshot(song);
  const songSnapshot: NoteSongSnapshot = matched
    ? { ...matched.song, ...incomingSnapshot }
    : incomingSnapshot;

  if (songKey.startsWith('catalog:') && !exactKey.startsWith('catalog:') && matched) {
    songSnapshot.id = matched.song.id;
    songSnapshot.source = matched.song.source === 'animethemes' ? 'animethemes' : 'anisongdb';
  }

  const updated: NoteMap = {
    ...notes,
    [songKey]: {
      songKey,
      text: normalizedText,
      updatedAt: new Date().toISOString(),
      song: songSnapshot,
    },
  };
  if (matched && matched.songKey !== songKey) delete updated[matched.songKey];
  if (!saveNotes(updated)) {
    throw new Error('This browser could not save the note. Check site-data permissions or storage space.');
  }
  return updated;
}

export function clearNote(notes: NoteMap, songOrKey: NoteableSong | string): NoteMap {
  const matchedKey = typeof songOrKey === 'string'
    ? songOrKey
    : findNoteForSong(notes, songOrKey)?.songKey ?? getSongNoteKey(songOrKey);
  if (!Object.prototype.hasOwnProperty.call(notes, matchedKey)) return notes;

  const updated = { ...notes };
  delete updated[matchedKey];
  if (!saveNotes(updated)) {
    throw new Error('This browser could not remove the note. Check site-data permissions and try again.');
  }
  return updated;
}

export function clearAllNotes(): boolean {
  const storage = getBrowserStorage();
  if (!storage) return false;

  try {
    storage.removeItem(NOTES_STORAGE_KEY);
    return true;
  } catch (error) {
    console.warn('Could not clear personal song notes from localStorage', error);
    return false;
  }
}
