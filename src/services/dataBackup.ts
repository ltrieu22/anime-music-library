import { copyAnimeSeasonMetadata } from './animeSeason';
import type {
  AnimeSongEntry,
  NoteMap,
  NoteSongSnapshot,
  PersonalSongNote,
} from '../types';
import { copyAnimeTitleMetadata } from './animeTitles';
import { validatePlaylists, PLAYLISTS_STORAGE_KEY, type CustomPlaylist } from './playlistsStorage';
import { NOTES_STORAGE_KEY, NOTES_STORAGE_VERSION } from './notesStorage';
import { LOCAL_STORAGE_KEY } from './api';

export const BACKUP_VERSION = 2;
const MAX_NOTE_LENGTH = 5_000;
const MAX_TEXT_FIELD_LENGTH = 2_000;

export interface DataBackupV1 {
  version: 1;
  entries: AnimeSongEntry[];
  notes: NoteMap;
}

export interface DataBackupV2 extends Omit<DataBackupV1, 'version'> {
  version: typeof BACKUP_VERSION;
  playlists: CustomPlaylist[];
}

// Missing sections mean preserve the current browser data, including later edits
// made while the import preview is open. Empty sections explicitly replace it.
export interface BackupImport {
  entries: AnimeSongEntry[];
  notes?: NoteMap;
  playlists?: CustomPlaylist[];
  skippedEntries: number;
  skippedNotes: number;
}

export function createDataBackup(entries: AnimeSongEntry[], notes: NoteMap, playlists: CustomPlaylist[]): DataBackupV2 {
  return structuredClone({ version: BACKUP_VERSION, entries, notes, playlists: validatePlaylists(playlists) });
}

export function parseDataBackup(value: unknown): BackupImport {
  let rawEntries: unknown[];
  let notes: NoteMap | undefined;
  let playlists: CustomPlaylist[] | undefined;
  let skippedNotes = 0;
  if (Array.isArray(value)) rawEntries = value;
  else if (isRecord(value)) {
    if (value.version !== 1 && value.version !== BACKUP_VERSION) throw new Error(`Unsupported backup version: ${String(value.version)}`);
    if (!Array.isArray(value.entries) || !isRecord(value.notes)) throw new Error('Backup must contain a songs array and notes object.');
    rawEntries = value.entries;
    notes = sanitizeNotes(value.notes);
    skippedNotes = Object.keys(value.notes).length - Object.keys(notes).length;
    if (value.version === BACKUP_VERSION) playlists = validatePlaylists(value.playlists);
  } else throw new Error('JSON must be an anime-song backup.');
  const entries = rawEntries.map(sanitizeEntry).filter((entry): entry is AnimeSongEntry => entry !== null);
  if (entries.length === 0 && rawEntries.length > 0) throw new Error('Backup does not contain any valid song entries.');
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) throw new Error('Backup contains duplicate saved-song numbers.');
  return { entries, notes, playlists, skippedEntries: rawEntries.length - entries.length, skippedNotes };
}

/** Commit all included sections before updating React. Recover prior bytes on a failed write. */
export function persistBackupImport(data: BackupImport, storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = localStorage): void {
  const writes: [string, string][] = [[LOCAL_STORAGE_KEY, JSON.stringify(data.entries)]];
  if (data.notes !== undefined) writes.push([NOTES_STORAGE_KEY, JSON.stringify({ version: NOTES_STORAGE_VERSION, notes: data.notes })]);
  if (data.playlists !== undefined) writes.push([PLAYLISTS_STORAGE_KEY, JSON.stringify({ version: 1, playlists: validatePlaylists(data.playlists) })]);
  // Read every original value before writing anything; storage access may itself fail.
  const previous = writes.map(([key]) => storage.getItem(key));
  let written = 0;
  try {
    for (const [key, value] of writes) { storage.setItem(key, value); written++; }
  } catch {
    let recovered = true;
    for (let i = written - 1; i >= 0; i--) {
      try {
        if (previous[i] === null) storage.removeItem(writes[i][0]);
        else storage.setItem(writes[i][0], previous[i]!);
      } catch { recovered = false; }
    }
    throw new Error(recovered
      ? 'Could not save the backup. Existing data was restored. Check browser storage space or site-data permissions and retry.'
      : 'Import failed and some previous data could not be restored. Keep your backup file and reload to inspect the stored data before retrying.');
  }
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const sanitizeText = (
  value: unknown,
  maxLength = MAX_TEXT_FIELD_LENGTH
): string => (typeof value === 'string' ? value.trim().slice(0, maxLength) : '');

const sanitizeIdentifier = (value: unknown): string | number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;

  const sanitized = value.trim().slice(0, 512);
  return sanitized.length > 0 ? sanitized : null;
};

const sanitizeOptionalUrl = (value: unknown): string | null | undefined => {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;

  const sanitized = value.trim().slice(0, 4_096);
  return sanitized.length > 0 ? sanitized : undefined;
};

const sanitizeYear = (value: unknown): number => {
  const year = Number(value);
  return Number.isFinite(year) && year > 0 ? Math.trunc(year) : 2020;
};

export const sanitizeEntry = (
  value: unknown,
  index: number
): AnimeSongEntry | null => {
  if (!isRecord(value)) return null;

  const animeName = sanitizeText(value.anime_name);
  if (!animeName) return null;

  const rawId = Number(value.id);
  const entry: AnimeSongEntry = {
    ...copyAnimeTitleMetadata(value),
    ...copyAnimeSeasonMetadata(value),
    id: Number.isFinite(rawId) && rawId !== 0 ? rawId : index + 1,
    anime_name: animeName,
    anime_year: sanitizeYear(value.anime_year),
    artist: sanitizeText(value.artist),
    song_name: sanitizeText(value.song_name),
  };

  const themeType = sanitizeText(value.theme_type, 100);
  if (themeType) entry.theme_type = themeType;

  const videoUrl = sanitizeOptionalUrl(value.video_url);
  if (typeof videoUrl === 'string') entry.video_url = videoUrl;

  const audioUrl = sanitizeOptionalUrl(value.audio_url);
  if (typeof audioUrl === 'string') entry.audio_url = audioUrl;

  const sourceSongId = sanitizeIdentifier(value.source_song_id);
  if (sourceSongId !== null) entry.source_song_id = sourceSongId;

  const localSongId = sanitizeIdentifier(value.local_song_id);
  if (typeof localSongId === 'string') entry.local_song_id = localSongId;

  return entry;
};

const sanitizeNoteSong = (
  value: unknown,
  fallbackId: string
): NoteSongSnapshot | null => {
  if (!isRecord(value)) return null;

  const id = sanitizeIdentifier(value.id) ?? fallbackId;
  const animeName = sanitizeText(value.anime_name);
  if (!animeName) return null;

  const song: NoteSongSnapshot = {
    ...copyAnimeTitleMetadata(value),
    ...copyAnimeSeasonMetadata(value),
    id,
    anime_name: animeName,
    anime_year: sanitizeYear(value.anime_year),
    artist: sanitizeText(value.artist),
    song_name: sanitizeText(value.song_name),
  };

  const themeType = sanitizeText(value.theme_type, 100);
  if (themeType) song.theme_type = themeType;

  const videoUrl = sanitizeOptionalUrl(value.video_url);
  if (videoUrl !== undefined) song.video_url = videoUrl;

  const audioUrl = sanitizeOptionalUrl(value.audio_url);
  if (audioUrl !== undefined) song.audio_url = audioUrl;

  if (value.anilist_id === null) {
    song.anilist_id = null;
  } else if (
    typeof value.anilist_id === 'number' &&
    Number.isFinite(value.anilist_id)
  ) {
    song.anilist_id = value.anilist_id;
  }

  if (
    value.source === 'anisongdb' ||
    value.source === 'animethemes' ||
    value.source === 'collection'
  ) {
    song.source = value.source;
  }

  return song;
};

export const sanitizeNotes = (value: unknown): NoteMap => {
  const sanitized: NoteMap = {};
  if (!isRecord(value)) return sanitized;

  Object.entries(value).forEach(([rawKey, rawNote]) => {
    if (!isRecord(rawNote)) return;

    const keyIdentifier = sanitizeIdentifier(rawNote.songKey) ??
      sanitizeIdentifier(rawKey);
    if (keyIdentifier === null) return;

    const songKey = String(keyIdentifier);
    if (
      songKey === '__proto__' ||
      songKey === 'prototype' ||
      songKey === 'constructor'
    ) {
      return;
    }

    const text = sanitizeText(rawNote.text, MAX_NOTE_LENGTH);
    if (!text) return;

    const song = sanitizeNoteSong(rawNote.song, songKey);
    if (!song) return;

    const parsedTimestamp =
      typeof rawNote.updatedAt === 'string'
        ? Date.parse(rawNote.updatedAt)
        : Number.NaN;
    const updatedAt = Number.isFinite(parsedTimestamp)
      ? new Date(parsedTimestamp).toISOString()
      : new Date().toISOString();

    const note: PersonalSongNote = { songKey, text, updatedAt, song };
    sanitized[songKey] = note;
  });

  return sanitized;
};
