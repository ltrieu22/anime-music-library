import React, { useState, useEffect } from 'react';
import { X, Save, Edit3 } from 'lucide-react';
import { AnimeSongEntry } from '../types';

interface EditSongModalProps {
  isOpen: boolean;
  entry: AnimeSongEntry | null;
  onClose: () => void;
  onSave: (id: number, updated: Partial<AnimeSongEntry>) => Promise<void>;
}

export const EditSongModal: React.FC<EditSongModalProps> = ({
  isOpen,
  entry,
  onClose,
  onSave,
}) => {
  const [animeName, setAnimeName] = useState('');
  const [animeYear, setAnimeYear] = useState<number | ''>(2022);
  const [artist, setArtist] = useState('');
  const [songName, setSongName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (entry) {
      setAnimeName(entry.anime_name || '');
      setAnimeYear(entry.anime_year || 2022);
      setArtist(entry.artist || '');
      setSongName(entry.song_name || '');
      setError('');
    }
  }, [entry, isOpen]);

  if (!isOpen || !entry) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!animeName.trim()) {
      setError('Anime name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave(entry.id, {
        anime_name: animeName.trim(),
        anime_year: Number(animeYear) || entry.anime_year,
        artist: artist.trim(),
        song_name: songName.trim(),
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update song');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="bg-[#1e2022] border border-neutral-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-900/50">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-emerald-400" />
            <span>Edit Song Entry #{entry.id}</span>
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800/60 text-rose-300 text-xs">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">
              Anime Name <span className="text-emerald-400">*</span>
            </label>
            <input
              type="text"
              required
              value={animeName}
              onChange={(e) => setAnimeName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-neutral-900 border border-neutral-700/80 rounded-lg text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">
              Anime Year
            </label>
            <input
              type="number"
              min="1960"
              max="2030"
              value={animeYear}
              onChange={(e) =>
                setAnimeYear(e.target.value === '' ? '' : Number(e.target.value))
              }
              className="w-full px-3.5 py-2.5 bg-neutral-900 border border-neutral-700/80 rounded-lg text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">
              Artist Name
            </label>
            <input
              type="text"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-neutral-900 border border-neutral-700/80 rounded-lg text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">
              Song Name
            </label>
            <input
              type="text"
              value={songName}
              onChange={(e) => setSongName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-neutral-900 border border-neutral-700/80 rounded-lg text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
            />
          </div>

          <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-neutral-300 hover:bg-neutral-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-neutral-950 bg-emerald-400 hover:bg-emerald-300 active:scale-98 transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSubmitting ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
