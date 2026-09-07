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
import type { AnimeSongEntry, NoteMap } from '../types';
import { createDataBackup, parseDataBackup, type BackupImport } from '../services/dataBackup';
import { loadPlaylists } from '../services/playlistsStorage';
import { usePlaylists } from '../context/PlaylistsContext';

const countLabel = (count: number, label: string) => `${count} ${label}${count === 1 ? '' : 's'}`;

interface DataModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: AnimeSongEntry[];
  notes: NoteMap;
  onImportData: (data: BackupImport) => Promise<void>;
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
  const { playlists, error: playlistError } = usePlaylists();
  const [pendingImport, setPendingImport] = useState<BackupImport | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [isResetConfirm, setIsResetConfirm] = useState(false);

  if (!isOpen) return null;

  const handleExport = () => {
    let objectUrl: string | null = null;
    try {
      const backup = createDataBackup(entries, notes, loadPlaylists());
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
        text: `Exported ${countLabel(entries.length, 'song')}, ${countLabel(Object.keys(notes).length, 'personal note')}, and ${countLabel(backup.playlists.length, 'playlist')} successfully!`,
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

    setPendingImport(null);
    setStatusMessage(null);
    setIsBusy(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        setPendingImport(parseDataBackup(parsed));
      } catch (err: any) {
        setStatusMessage({
          type: 'error',
          text: `Import failed: ${err.message}`,
        });
      } finally {
        setIsBusy(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.onerror = () => {
      setIsBusy(false);
      setStatusMessage({ type: 'error', text: 'Could not read this file. Select it again to retry.' });
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const confirmImport = async () => {
    if (!pendingImport || isBusy) return;
    setIsBusy(true);
    try {
      await onImportData(pendingImport);
      setStatusMessage({ type: 'success', text: `Imported ${countLabel(pendingImport.entries.length, 'song')}. ${pendingImport.notes === undefined ? 'Existing personal notes kept.' : `${countLabel(Object.keys(pendingImport.notes).length, 'personal note')} restored.`} ${pendingImport.playlists === undefined ? 'Existing playlists kept.' : `${countLabel(pendingImport.playlists.length, 'playlist')} restored in backup order.`}` });
      setPendingImport(null);
    } catch (cause) {
      setStatusMessage({ type: 'error', text: `Import failed: ${cause instanceof Error ? cause.message : String(cause)}` });
    } finally { setIsBusy(false); }
  };

  const close = () => {
    if (isBusy) return;
    setPendingImport(null);
    setStatusMessage(null);
    setIsResetConfirm(false);
    onClose();
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
            onClick={close}
            disabled={isBusy}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            aria-label="Close data manager"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {statusMessage && (
            <div
              role={statusMessage.type === 'error' ? 'alert' : 'status'}
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
          <p className="text-xs leading-5 text-neutral-400">
            JSON backups include Saved Songs, personal notes, and custom playlists with their song order. Player queues and display preferences stay in this browser.
          </p>
          {playlistError && <p role="alert" className="text-xs text-rose-300">{playlistError} Export is unavailable until playlists can be read. A valid backup can still be imported.</p>}
          <div className="bg-neutral-900/80 border border-neutral-800 p-4 rounded-xl flex items-center justify-between gap-4">
            <div>
              <div className="font-semibold text-neutral-200 text-sm flex items-center gap-2">
                <Download className="w-4 h-4 text-emerald-400" />
                <span>Export to JSON</span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Back up your {countLabel(entries.length, 'song')} and {countLabel(Object.keys(notes).length, 'personal note')}, plus {countLabel(playlists.length, 'custom playlist')}.
              </p>
            </div>
            <button
              onClick={handleExport}
              disabled={isBusy || Boolean(playlistError)}
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
                Review a backup before replacing your data. Older backups keep existing playlists; song-only files also keep notes.
              </p>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileChange}
                aria-label="Backup JSON file"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isBusy || isResetConfirm}
                className="px-3.5 py-2 rounded-lg text-xs font-medium text-neutral-200 bg-neutral-800 hover:bg-neutral-700 active:scale-98 border border-neutral-700 transition-all cursor-pointer whitespace-nowrap"
              >
                Select File
              </button>
            </div>
          </div>

          {pendingImport && <div role="region" aria-label="Review backup import" className="space-y-3 rounded-xl border border-amber-800/60 bg-amber-950/30 p-4 text-sm text-neutral-200">
            <h3 className="font-semibold">Review backup import</h3>
            <p>Replace Saved Songs with {countLabel(pendingImport.entries.length, 'song')}.</p>
            <p>{pendingImport.notes === undefined ? 'Keep existing personal notes.' : `Replace personal notes with ${countLabel(Object.keys(pendingImport.notes).length, 'note')}.`}</p>
            <p>{pendingImport.playlists === undefined ? 'Keep existing custom playlists.' : `Replace all custom playlists with ${countLabel(pendingImport.playlists.length, 'playlist')}, preserving their identities and song order.`}</p>
            {(pendingImport.skippedEntries > 0 || pendingImport.skippedNotes > 0) && <p className="text-amber-300">Skipped {pendingImport.skippedEntries} invalid songs and {pendingImport.skippedNotes} invalid notes.</p>}
            <p className="text-xs text-neutral-400">Import replaces the sections listed above and closes playback. Export first if you need a copy of your current data.</p>
            <div className="flex flex-wrap justify-end gap-2">
              <button disabled={isBusy} onClick={() => { setPendingImport(null); setStatusMessage(null); }} className="min-h-11 rounded-lg px-3 hover:bg-neutral-800 cursor-pointer">Cancel import</button>
              <button disabled={isBusy} onClick={confirmImport} className="min-h-11 rounded-lg bg-emerald-400 px-3 font-semibold text-neutral-950 cursor-pointer">{isBusy ? 'Importing…' : 'Import backup'}</button>
            </div>
          </div>}

          {/* Reset to Default */}
          <div className="bg-neutral-900/80 border border-neutral-800 p-4 rounded-xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-semibold text-neutral-200 text-sm flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-amber-400" />
                  <span>Restore Default Database</span>
                </div>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Permanently delete all entries in your collection and all{' '}
                  {Object.keys(notes).length} personal notes in this browser. Custom playlists are kept.
                </p>
              </div>

              {!isResetConfirm ? (
                <button
                  onClick={() => setIsResetConfirm(true)}
                  disabled={isBusy || Boolean(pendingImport)}
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
            onClick={close}
            disabled={isBusy}
            className="px-4 py-1.5 rounded-lg text-xs font-medium text-neutral-300 hover:bg-neutral-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
