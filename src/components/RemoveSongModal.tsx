import React, { useEffect, useRef, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import type { AnimeSongEntry } from '../types';

interface RemoveSongModalProps {
  entry: AnimeSongEntry;
  onClose: () => void;
  onRemove: (id: number) => Promise<void>;
}

export function RemoveSongModal({ entry, onClose, onRemove }: RemoveSongModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const pendingRef = useRef(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const returnTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current!;
    // The modal top layer makes the page inert and contains keyboard focus.
    dialog.showModal();
    cancelRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (returnTarget?.isConnected) returnTarget.focus();
      else document.getElementById('search-input')?.focus();
    };
  }, []);

  const requestClose = () => {
    if (!pendingRef.current) onClose();
  };

  const handleRemove = async () => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setIsRemoving(true);
    setError('');
    try {
      await onRemove(entry.id);
      onClose();
    } catch {
      setError('Could not remove this song. Check that this browser allows saving site data, then try again.');
      pendingRef.current = false;
      setIsRemoving(false);
      cancelRef.current?.focus();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="remove-song-title"
      aria-describedby="remove-song-description remove-song-details"
      aria-modal="true"
      aria-busy={isRemoving}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (!first) {
          event.preventDefault();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right ||
            event.clientY < bounds.top || event.clientY > bounds.bottom) requestClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-neutral-800 bg-[#1e2022] p-0 text-neutral-100 shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-xs"
    >
      <div className="flex items-center justify-between gap-3 border-b border-neutral-800 bg-neutral-900/50 px-5 py-3">
        <h2 id="remove-song-title" className="flex items-center gap-2 text-base font-bold text-white">
          <Trash2 aria-hidden="true" className="h-4 w-4 shrink-0 text-rose-400" />
          Remove song?
        </h2>
        <button
          type="button"
          onClick={requestClose}
          disabled={isRemoving}
          aria-label="Close removal dialog"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300 disabled:opacity-50"
        >
          <X aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>
      <div className="space-y-4 p-5">
        <div id="remove-song-details" className="space-y-1 rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 break-words">
          <p className="text-sm font-semibold text-white">{entry.song_name || 'Untitled song'}</p>
          <p className="text-sm text-neutral-300">{entry.anime_name}</p>
          {entry.artist && <p className="text-xs text-neutral-400">{entry.artist}</p>}
          <p className="text-xs font-mono text-neutral-500">
            #{entry.id}{entry.theme_type ? ` · ${entry.theme_type}` : ''}{entry.anime_year ? ` · ${entry.anime_year}` : ''}
          </p>
        </div>
        <p id="remove-song-description" className="text-sm leading-6 text-neutral-400">
          Remove this song from My Collection? Your personal note will stay in Notes.
        </p>
        {error && <p role="alert" className="rounded-lg border border-rose-800/60 bg-rose-950/50 p-3 text-sm text-rose-300">{error}</p>}
        <div className="flex flex-wrap justify-end gap-3 border-t border-neutral-800 pt-4">
          <button
            ref={cancelRef}
            type="button"
            onClick={requestClose}
            disabled={isRemoving}
            className="min-h-11 rounded-lg px-4 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-300 disabled:opacity-50"
          >Cancel</button>
          <button
            type="button"
            onClick={handleRemove}
            disabled={isRemoving}
            className="min-h-11 rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300 disabled:opacity-50"
          >{isRemoving ? 'Removing…' : 'Remove song'}</button>
        </div>
      </div>
    </dialog>
  );
}
