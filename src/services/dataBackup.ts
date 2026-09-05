import type {
  AnimeSongEntry,
  NoteMap,
  NoteSongSnapshot,
  PersonalSongNote,
} from '../types';
import { copyAnimeTitleMetadata } from './animeTitles';

export const BACKUP_VERSION = 1;
const MAX_NOTE_LENGTH = 5_000;
const MAX_TEXT_FIELD_LENGTH = 2_000;

export interface DataBackupV1 {
  version: typeof BACKUP_VERSION;
  entries: AnimeSongEntry[];
  notes: NoteMap;
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
