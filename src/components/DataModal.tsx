import React, { useRef, useState } from 'react';
import {
  X,
  Download,
  Upload,
  RotateCcw,
  Database,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import type {
  AnimeSongEntry,
  NoteMap,
  NoteSongSnapshot,
  PersonalSongNote,
} from '../types';

const BACKUP_VERSION = 1;
const MAX_NOTE_LENGTH = 5_000;
const MAX_TEXT_FIELD_LENGTH = 2_000;

interface DataBackupV1 {
  version: typeof BACKUP_VERSION;
  entries: AnimeSongEntry[];
  notes: NoteMap;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
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

const sanitizeEntry = (
  value: unknown,
  index: number
): AnimeSongEntry | null => {
  if (!isRecord(value)) return null;

  const animeName = sanitizeText(value.anime_name);
  if (!animeName) return null;

  const rawId = Number(value.id);
  const entry: AnimeSongEntry = {
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

const sanitizeNotes = (value: unknown): NoteMap => {
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

interface DataModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: AnimeSongEntry[];
  notes: NoteMap;
  onImportData: (
    importedEntries: AnimeSongEntry[],
    importedNotes: NoteMap
  ) => Promise<void>;
  onResetToDefault: () => Promise<void>;
  onClearNotes: () => void | Promise<void>;
}

export const DataModal: React.FC<DataModalProps> = ({
  isOpen,
  onClose,
  entries,
  notes,
  onImportData,
  onResetToDefault,
  onClearNotes,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [isResetConfirm, setIsResetConfirm] = useState(false);

  if (!isOpen) return null;

  const handleExport = () => {
    let objectUrl: string | null = null;
    try {
      const backup: DataBackupV1 = {
        version: BACKUP_VERSION,
        entries,
        notes,
      };
      const backupBlob = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      objectUrl = URL.createObjectURL(backupBlob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', objectUrl);
      downloadAnchor.setAttribute(
        'download',
        `anime_songs_backup_${new Date().toISOString().slice(0, 10)}.json`
      );
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      setStatusMessage({
        type: 'success',
        text: `Exported ${entries.length} songs and ${Object.keys(notes).length} personal notes successfully!`,
      });
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `Failed to export: ${err.message}`,
      });
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        let rawEntries: unknown[];
        let importedNotes: NoteMap;
        let keptExistingNotes = false;

        if (Array.isArray(parsed)) {
          // Backward compatibility for backups created before personal notes.
          rawEntries = parsed;
          importedNotes = notes;
          keptExistingNotes = true;
        } else if (isRecord(parsed)) {
          if (parsed.version !== BACKUP_VERSION) {
            throw new Error(`Unsupported backup version: ${String(parsed.version)}`);
          }
          if (!Array.isArray(parsed.entries) || !isRecord(parsed.notes)) {
            throw new Error('Backup must contain a songs array and notes object');
          }
          rawEntries = parsed.entries;
          importedNotes = sanitizeNotes(parsed.notes);
        } else {
          throw new Error('JSON must be an anime-song backup');
        }

        const validEntries = rawEntries
          .map(sanitizeEntry)
          .filter((entry): entry is AnimeSongEntry => entry !== null);

        if (validEntries.length === 0 && rawEntries.length > 0) {
          throw new Error('Backup does not contain any valid song entries');
        }

        await onImportData(validEntries, importedNotes);
        setStatusMessage({
          type: 'success',
          text: keptExistingNotes
            ? `Imported ${validEntries.length} songs. Existing personal notes were kept.`
            : `Imported ${validEntries.length} songs and ${Object.keys(importedNotes).length} personal notes!`,
        });
      } catch (err: any) {
        setStatusMessage({
          type: 'error',
          text: `Import failed: ${err.message}`,
        });
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleReset = async () => {
    try {
      await onResetToDefault();
      await onClearNotes();
      setIsResetConfirm(false);
      setStatusMessage({
        type: 'success',
        text: 'Database restored and all personal notes deleted.',
      });
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `Reset failed: ${err.message}`,
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="bg-[#1e2022] border border-neutral-800 rounded-2xl w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-900/50">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-400" />
            <span>Manage Song Database</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            aria-label="Close data manager"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {statusMessage && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-950/60 border border-emerald-800/60 text-emerald-300'
                  : 'bg-rose-950/60 border border-rose-800/60 text-rose-300'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* Export */}
          <div className="bg-neutral-900/80 border border-neutral-800 p-4 rounded-xl flex items-center justify-between gap-4">
            <div>
              <div className="font-semibold text-neutral-200 text-sm flex items-center gap-2">
                <Download className="w-4 h-4 text-emerald-400" />
                <span>Export to JSON</span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Back up your {entries.length} songs and {Object.keys(notes).length}{' '}
                personal notes.
              </p>
            </div>
            <button
              onClick={handleExport}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold text-neutral-950 bg-emerald-400 hover:bg-emerald-300 active:scale-98 transition-all cursor-pointer whitespace-nowrap"
            >
              Export (.json)
            </button>
          </div>

          {/* Import */}
          <div className="bg-neutral-900/80 border border-neutral-800 p-4 rounded-xl flex items-center justify-between gap-4">
            <div>
              <div className="font-semibold text-neutral-200 text-sm flex items-center gap-2">
                <Upload className="w-4 h-4 text-emerald-400" />
                <span>Import JSON</span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Restore songs and personal notes from a backup file.
              </p>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-2 rounded-lg text-xs font-medium text-neutral-200 bg-neutral-800 hover:bg-neutral-700 active:scale-98 border border-neutral-700 transition-all cursor-pointer whitespace-nowrap"
              >
                Select File
              </button>
            </div>
          </div>

          {/* Reset to Default */}
          <div className="bg-neutral-900/80 border border-neutral-800 p-4 rounded-xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-semibold text-neutral-200 text-sm flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-amber-400" />
                  <span>Restore Default Database</span>
                </div>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Restore the original 67 entries and permanently delete all{' '}
                  {Object.keys(notes).length} personal notes in this browser.
                </p>
              </div>

              {!isResetConfirm ? (
                <button
                  onClick={() => setIsResetConfirm(true)}
                  className="px-3.5 py-2 rounded-lg text-xs font-medium text-amber-300 bg-amber-950/40 hover:bg-amber-950/80 border border-amber-800/60 transition-all cursor-pointer whitespace-nowrap"
                >
                  Reset...
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsResetConfirm(false)}
                    className="px-2.5 py-1.5 rounded-lg text-xs text-neutral-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReset}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 transition-all cursor-pointer"
                  >
                    Reset &amp; Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-neutral-800 bg-neutral-900/40 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-medium text-neutral-300 hover:bg-neutral-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
