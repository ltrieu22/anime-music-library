import React, { useRef, useState } from 'react';
import {
  X,
  Download,
  Upload,
  RotateCcw,
  Database,
  FileJson,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { AnimeSongEntry } from '../types';

interface DataModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: AnimeSongEntry[];
  onImportEntries: (imported: AnimeSongEntry[]) => Promise<void>;
  onResetToDefault: () => Promise<void>;
}

export const DataModal: React.FC<DataModalProps> = ({
  isOpen,
  onClose,
  entries,
  onImportEntries,
  onResetToDefault,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [isResetConfirm, setIsResetConfirm] = useState(false);

  if (!isOpen) return null;

  const handleExport = () => {
    try {
      const dataStr =
        'data:text/json;charset=utf-8,' +
        encodeURIComponent(JSON.stringify(entries, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute(
        'download',
        `anime_songs_backup_${new Date().toISOString().slice(0, 10)}.json`
      );
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      setStatusMessage({
        type: 'success',
        text: `Exported ${entries.length} songs to JSON successfully!`,
      });
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `Failed to export: ${err.message}`,
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!Array.isArray(parsed)) {
          throw new Error('JSON root must be an array of songs');
        }

        const validEntries: AnimeSongEntry[] = parsed.map((item, idx) => ({
          id: Number(item.id) || idx + 1,
          anime_name: String(item.anime_name || '').trim(),
          anime_year: Number(item.anime_year) || 2020,
          artist: String(item.artist || '').trim(),
          song_name: String(item.song_name || '').trim(),
        })).filter((item) => item.anime_name.length > 0);

        await onImportEntries(validEntries);
        setStatusMessage({
          type: 'success',
          text: `Successfully imported ${validEntries.length} songs!`,
        });
      } catch (err: any) {
        setStatusMessage({
          type: 'error',
          text: `Import failed: ${err.message}`,
        });
      }
    };
    reader.readAsText(file);
  };

  const handleReset = async () => {
    try {
      await onResetToDefault();
      setIsResetConfirm(false);
      setStatusMessage({
        type: 'success',
        text: 'Database reset to default 67 tracks successfully.',
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
      <div className="bg-[#1e2022] border border-neutral-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-900/50">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-400" />
            <span>Manage Song Database</span>
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
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
                Download a backup copy of your current {entries.length} songs.
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
                Upload a customized `data.json` file.
              </p>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
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
                  Reset the library back to the original 67 verified entries.
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
                    Confirm
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
