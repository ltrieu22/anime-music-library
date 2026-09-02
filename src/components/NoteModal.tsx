import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Calendar, Save, StickyNote, Trash2, User, X } from 'lucide-react';
import {
  AnimeSongEntry,
  AnimeSongItem,
  NoteSongSnapshot,
  PersonalSongNote,
} from '../types';
import { getSongNoteKey, MAX_NOTE_LENGTH } from '../services/notesStorage';

type NoteableSong = AnimeSongEntry | AnimeSongItem | NoteSongSnapshot;

interface NoteModalProps {
  isOpen: boolean;
  song: NoteableSong | null;
  note?: PersonalSongNote;
  onClose: () => void;
  onSave: (song: NoteableSong, text: string) => void | Promise<void>;
  onClear: (song: NoteableSong) => void | Promise<void>;
}

export const NoteModal: React.FC<NoteModalProps> = ({
  isOpen,
  song,
  note,
  onClose,
  onSave,
  onClear,
}) => {
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const initialTextRef = useRef('');
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const songKey = song ? getSongNoteKey(song) : null;

  const requestClose = useCallback(() => {
    if (isSubmitting) return;
    if (
      text !== initialTextRef.current
      && !window.confirm('Discard your unsaved note changes?')
    ) {
      return;
    }
    onClose();
  }, [isSubmitting, onClose, text]);

  useEffect(() => {
    if (!isOpen || !song) return;

    const initialText = note?.text ?? '';
    initialTextRef.current = initialText;
    setText(initialText);
    setError('');
    setIsSubmitting(false);
  }, [isOpen, songKey]);

  useEffect(() => {
    if (!isOpen || !song) return;

    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusTimer = window.setTimeout(() => textareaRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(focusTimer);
      const returnTarget = returnFocusRef.current;
      if (returnTarget && document.contains(returnTarget)) returnTarget.focus();
      else {
        const fallbackTarget = document.getElementById('notes-tab-btn')
          ?? document.getElementById('search-input');
        fallbackTarget?.focus();
      }
      returnFocusRef.current = null;
    };
  }, [isOpen, songKey]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusableElements: HTMLElement[] = dialogRef.current
        ? Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ))
        : [];
      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, requestClose]);

  if (!isOpen || !song) return null;

  const normalizedText = text.trim();
  const hasSavedNote = Boolean(note?.text.trim());

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!normalizedText || isSubmitting) return;

    setIsSubmitting(true);
    setError('');
    try {
      await onSave(song, normalizedText);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save this note.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClear = async () => {
    if (!hasSavedNote || isSubmitting) return;

    const songLabel = song.song_name || song.anime_name || 'this song';
    if (!window.confirm(`Clear your note for "${songLabel}"? This cannot be undone.`)) return;

    setIsSubmitting(true);
    setError('');
    try {
      await onClear(song);
      onClose();
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : 'Could not clear this note.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-modal-title"
        aria-describedby="note-storage-description"
        className="bg-[#1e2022] border border-neutral-800 rounded-2xl w-full max-w-xl max-h-[calc(100vh-2rem)] overflow-y-auto shadow-2xl animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-start justify-between gap-4 px-5 sm:px-6 py-4 border-b border-neutral-800 bg-neutral-900/50">
          <div className="min-w-0">
            <h2 id="note-modal-title" className="text-base font-bold text-white flex items-center gap-2">
              <StickyNote className="w-4 h-4 text-amber-300 fill-amber-300/20" />
              <span>{hasSavedNote ? 'Edit Personal Note' : 'Add Personal Note'}</span>
            </h2>
            <p className="text-xs text-neutral-400 mt-1 truncate">
              {song.song_name || 'Untitled song'}
              {song.artist ? ` · ${song.artist}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors disabled:opacity-50"
            aria-label="Close note editor"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 sm:p-6 space-y-4">
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3">
            <p className="text-sm font-semibold text-neutral-100 truncate">{song.anime_name}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-400">
              {song.artist && (
                <span className="inline-flex items-center gap-1.5">
                  <User className="w-3 h-3 text-neutral-500" />
                  {song.artist}
                </span>
              )}
              {song.anime_year && (
                <span className="inline-flex items-center gap-1.5 font-mono">
                  <Calendar className="w-3 h-3 text-neutral-500" />
                  {song.anime_year}
                </span>
              )}
              {song.theme_type && (
                <span className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-300 font-mono text-[10px]">
                  {song.theme_type}
                </span>
              )}
            </div>
          </div>

          {error && (
            <div role="alert" className="p-3 rounded-lg bg-rose-950/50 border border-rose-800/60 text-rose-300 text-xs">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="personal-song-note" className="block text-xs font-medium text-neutral-300 mb-1.5">
              Your note
            </label>
            <textarea
              ref={textareaRef}
              id="personal-song-note"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Add a memory, translation, rating, playlist idea…"
              rows={7}
              maxLength={MAX_NOTE_LENGTH}
              disabled={isSubmitting}
              className="w-full min-h-36 resize-y px-3.5 py-3 bg-neutral-900 border border-neutral-700/80 rounded-xl text-sm leading-6 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 disabled:opacity-60"
            />
            <p className="mt-1 text-right text-[10px] font-mono text-neutral-600">
              {text.length.toLocaleString()} / {MAX_NOTE_LENGTH.toLocaleString()}
            </p>
          </div>

          <p id="note-storage-description" className="text-[11px] leading-4 text-neutral-500">
            Saved only in this browser. Your note stays private and is never sent with catalog searches.
          </p>

          <div className="pt-3 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2.5 border-t border-neutral-800">
            <div>
              {hasSavedNote && (
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={isSubmitting}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium text-rose-300 hover:text-rose-200 hover:bg-rose-950/50 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear Note</span>
                </button>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={requestClose}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg text-xs font-medium text-neutral-300 hover:bg-neutral-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!normalizedText || isSubmitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-neutral-950 bg-amber-300 hover:bg-amber-200 active:scale-98 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" />
                <span>{isSubmitting ? 'Saving…' : 'Save Note'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
