import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  Plus,
  Check,
  Disc3,
  Loader2,
  Calendar,
  Sparkles,
  PenTool,
  Music,
} from 'lucide-react';
import { AnimeSearchResult, ThemeSongItem, AnimeSongEntry } from '../types';
import { searchAnime } from '../services/api';

interface AddSongModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddSong: (song: Omit<AnimeSongEntry, 'id'>) => Promise<void>;
}

export const AddSongModal: React.FC<AddSongModalProps> = ({
  isOpen,
  onClose,
  onAddSong,
}) => {
  const [activeTab, setActiveTab] = useState<'api' | 'manual'>('api');

  // API Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AnimeSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addedThemes, setAddedThemes] = useState<Set<string>>(new Set());

  // Manual Form states
  const [manualAnime, setManualAnime] = useState('');
  const [manualYear, setManualYear] = useState<number | ''>(new Date().getFullYear());
  const [manualArtist, setManualArtist] = useState('');
  const [manualSong, setManualSong] = useState('');
  const [manualError, setManualError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Debounced search for API tab
  useEffect(() => {
    if (!isOpen || activeTab !== 'api' || !searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await searchAnime(searchQuery);
        setSearchResults(res);
      } catch (err) {
        console.error('Failed to search anime', err);
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery, isOpen, activeTab]);

  if (!isOpen) return null;

  const handleAddFromTheme = async (
    anime: AnimeSearchResult,
    theme: ThemeSongItem
  ) => {
    const key = `${anime.name}-${theme.title}-${theme.artist}`;
    if (addedThemes.has(key)) return;

    try {
      await onAddSong({
        anime_name: anime.name,
        anime_year: anime.year || new Date().getFullYear(),
        artist: theme.artist,
        song_name: theme.title,
      });

      setAddedThemes((prev) => new Set([...prev, key]));
    } catch (err) {
      console.error('Error adding theme:', err);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualAnime.trim()) {
      setManualError('Anime name is required');
      return;
    }

    setIsSubmitting(true);
    setManualError('');

    try {
      await onAddSong({
        anime_name: manualAnime.trim(),
        anime_year: Number(manualYear) || 2024,
        artist: manualArtist.trim(),
        song_name: manualSong.trim(),
      });

      // Reset form
      setManualAnime('');
      setManualArtist('');
      setManualSong('');
      onClose();
    } catch (err: any) {
      setManualError(err.message || 'Failed to save song');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="bg-[#1e2022] border border-neutral-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-900/50">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Disc3 className="w-5 h-5 text-emerald-400" />
              <span>Add Anime Song</span>
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Pull themes via AnimeThemes & AniList or type manually
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-neutral-800 bg-[#232628] px-6 gap-6 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('api')}
            className={`py-3 border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'api'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Fast API Theme Lookup</span>
          </button>

          <button
            onClick={() => setActiveTab('manual')}
            className={`py-3 border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'manual'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <PenTool className="w-4 h-4" />
            <span>Manual Entry</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'api' ? (
            <div className="space-y-4">
              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Type an anime title (e.g., Chainsaw Man, Bocchi the Rock, Call of the Night)..."
                  className="w-full pl-10 pr-10 py-2.5 bg-neutral-900 border border-neutral-700/80 rounded-xl text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                  autoFocus
                />
                {isSearching && (
                  <Loader2 className="w-4 h-4 text-emerald-400 animate-spin absolute right-3.5 top-1/2 -translate-y-1/2" />
                )}
              </div>

              {/* Quick suggestions if query is empty */}
              {!searchQuery && (
                <div className="pt-2 text-xs text-neutral-400 space-y-2">
                  <span className="text-neutral-500">Popular queries to try:</span>
                  <div className="flex flex-wrap gap-2">
                    {['Chainsaw Man', 'Call of the Night', 'Bocchi the Rock', 'Frieren', 'Oshi no Ko', '86'].map(
                      (q) => (
                        <button
                          key={q}
                          onClick={() => setSearchQuery(q)}
                          className="px-2.5 py-1 rounded-md bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white transition-colors cursor-pointer"
                        >
                          {q}
                        </button>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* Results List */}
              {searchResults.length > 0 && (
                <div className="space-y-4 pt-2">
                  {searchResults.map((anime) => (
                    <div
                      key={anime.id}
                      className="bg-neutral-900/80 border border-neutral-800 rounded-xl p-4 flex flex-col sm:flex-row gap-4"
                    >
                      {/* Cover Poster if available */}
                      {anime.coverImage ? (
                        <img
                          src={anime.coverImage}
                          alt={anime.name}
                          width={64}
                          height={96}
                          className="w-16 h-24 object-cover rounded-lg border border-neutral-700/60 flex-shrink-0"
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="w-16 h-24 rounded-lg bg-neutral-800 border border-neutral-700/60 flex items-center justify-center text-neutral-600 flex-shrink-0">
                          <Music className="w-6 h-6" />
                        </div>
                      )}

                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-semibold text-neutral-100 text-sm">
                            {anime.name}
                          </h4>
                          {anime.year && (
                            <span className="text-xs px-2 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-400 font-mono">
                              {anime.year}
                            </span>
                          )}
                        </div>

                        {/* Themes (OP/ED/Insert) */}
                        {anime.themes && anime.themes.length > 0 ? (
                          <div className="space-y-1.5 pt-1">
                            <span className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
                              Soundtracks ({anime.themes.length}):
                            </span>
                            <div className="divide-y divide-neutral-800/80 max-h-48 overflow-y-auto pr-1">
                              {anime.themes.map((theme, i) => {
                                const key = `${anime.name}-${theme.title}-${theme.artist}`;
                                const isAdded = addedThemes.has(key);

                                return (
                                  <div
                                    key={i}
                                    className="py-1.5 flex items-center justify-between gap-2 text-xs"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-neutral-800 text-emerald-400 border border-neutral-700">
                                          {theme.type}
                                        </span>
                                        <span className="font-medium text-neutral-200 truncate">
                                          {theme.title}
                                        </span>
                                      </div>
                                      <div className="text-neutral-400 text-[11px] truncate pl-7">
                                        {theme.artist}
                                      </div>
                                    </div>

                                    <button
                                      onClick={() =>
                                        handleAddFromTheme(anime, theme)
                                      }
                                      disabled={isAdded}
                                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                                        isAdded
                                          ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 cursor-default'
                                          : 'bg-emerald-400 hover:bg-emerald-300 text-neutral-950'
                                      }`}
                                    >
                                      {isAdded ? (
                                        <>
                                          <Check className="w-3 h-3" />
                                          <span>Added</span>
                                        </>
                                      ) : (
                                        <>
                                          <Plus className="w-3 h-3" />
                                          <span>Add</span>
                                        </>
                                      )}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-neutral-500 italic">
                            No theme tracks indexed. You can add a song manually using this title.
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {searchQuery && !isSearching && searchResults.length === 0 && (
                <div className="text-center py-8 text-neutral-400 text-xs">
                  No anime found for "{searchQuery}". Switch to Manual Entry to add it directly.
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleManualSubmit} className="space-y-4">
              {manualError && (
                <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800/60 text-rose-300 text-xs">
                  {manualError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Anime Name <span className="text-emerald-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={manualAnime}
                  onChange={(e) => setManualAnime(e.target.value)}
                  placeholder="e.g., Call of the Night"
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
                  value={manualYear}
                  onChange={(e) =>
                    setManualYear(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  placeholder="e.g., 2022"
                  className="w-full px-3.5 py-2.5 bg-neutral-900 border border-neutral-700/80 rounded-lg text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Artist Name
                </label>
                <input
                  type="text"
                  value={manualArtist}
                  onChange={(e) => setManualArtist(e.target.value)}
                  placeholder="e.g., Creepy Nuts"
                  className="w-full px-3.5 py-2.5 bg-neutral-900 border border-neutral-700/80 rounded-lg text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Song Name / Theme Title
                </label>
                <input
                  type="text"
                  value={manualSong}
                  onChange={(e) => setManualSong(e.target.value)}
                  placeholder="e.g., Daten (OP)"
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
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-neutral-950 bg-emerald-400 hover:bg-emerald-300 active:scale-98 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : 'Save Song'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
