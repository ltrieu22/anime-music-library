import React from 'react';
import { Music, Plus, Database, Disc3, Globe, StickyNote } from 'lucide-react';
import { AnimeSongEntry, DatabaseMode } from '../types';

interface HeaderProps {
  entries: AnimeSongEntry[];
  onOpenAddModal: () => void;
  onOpenDataModal: () => void;
  mode: DatabaseMode;
  onModeChange: (mode: DatabaseMode) => void;
  animeThemesCount?: number;
  noteCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  entries,
  onOpenAddModal,
  onOpenDataModal,
  mode,
  onModeChange,
  animeThemesCount = 0,
  noteCount = 0,
}) => {
  const [imgHasError, setImgHasError] = React.useState(false);

  const validYears = entries.map((e) => e.anime_year).filter(Boolean);
  const minYear = validYears.length ? Math.min(...validYears) : 0;
  const maxYear = validYears.length ? Math.max(...validYears) : 0;

  const uniqueArtists = new Set(entries.map((e) => e.artist.trim()).filter(Boolean)).size;

  return (
    <header className="border-b border-neutral-800 bg-[#1c1e20] sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
        {/* Navigation & Brand Icon */}
        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto min-w-0">
          {/* Brand Logo (Marcille) */}
          {!imgHasError ? (
            <img
              src="/marcille.png"
              alt="Marcille"
              className="h-9 w-auto rounded-lg border border-emerald-500/40 bg-neutral-900 shadow-sm flex-shrink-0"
              onError={() => setImgHasError(true)}
            />
          ) : (
            <div className="w-9 h-9 rounded-lg border border-emerald-500/40 bg-neutral-900 flex-shrink-0 flex items-center justify-center text-emerald-400">
              <Disc3 className="w-4 h-4" />
            </div>
          )}

          {/* Catalog / Collection Switcher */}
          <div className="flex items-center bg-neutral-900/90 border border-neutral-800 p-1 rounded-lg text-xs font-medium min-w-0 max-w-full overflow-x-auto">
            <button
              type="button"
              onClick={() => onModeChange('anisongdb')}
              aria-pressed={mode === 'anisongdb' || mode === 'animethemes'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                mode === 'anisongdb' || mode === 'animethemes'
                  ? 'bg-emerald-500 text-neutral-950 font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Catalog</span>
            </button>

            <button
              type="button"
              onClick={() => onModeChange('collection')}
              aria-pressed={mode === 'collection'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                mode === 'collection'
                  ? 'bg-emerald-500 text-neutral-950 font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Music className="w-3.5 h-3.5" />
              <span className="hidden min-[380px]:inline">My Collection</span>
              <span className="min-[380px]:hidden">Mine</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                mode === 'collection' ? 'bg-neutral-950/20 text-neutral-900 font-bold' : 'bg-neutral-800 text-neutral-400'
              }`}>
                {entries.length}
              </span>
            </button>

            <button
              id="notes-tab-btn"
              type="button"
              onClick={() => onModeChange('notes')}
              aria-pressed={mode === 'notes'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                mode === 'notes'
                  ? 'bg-amber-400 text-neutral-950 font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <StickyNote className="w-3.5 h-3.5" />
              <span>Notes</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                mode === 'notes'
                  ? 'bg-neutral-950/20 text-neutral-900 font-bold'
                  : 'bg-neutral-800 text-neutral-400'
              }`}>
                {noteCount}
              </span>
            </button>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-end gap-2.5 w-full sm:w-auto">
          <button
            id="data-mgmt-btn"
            type="button"
            onClick={onOpenDataModal}
            aria-label="Manage data"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-300 bg-neutral-800/80 hover:bg-neutral-700/80 hover:text-white border border-neutral-700/60 transition-all cursor-pointer"
          >
            <Database className="w-3.5 h-3.5 text-neutral-400" />
            <span className="hidden sm:inline">Manage Data</span>
          </button>

          <button
            id="header-add-song-btn"
            type="button"
            onClick={onOpenAddModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-neutral-950 bg-emerald-400 hover:bg-emerald-300 active:scale-98 shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Song</span>
          </button>
        </div>
      </div>
    </header>
  );
};
