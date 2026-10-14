import React from 'react';
import { Music, Plus, Database, Disc3, Globe, StickyNote } from 'lucide-react';
import { AnimeSongEntry, DatabaseMode } from '../types';
import { useTitleLanguage } from '../context/TitleLanguageContext';

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
  const { language, setLanguage, storageError } = useTitleLanguage();

  // Base for static assets (relative, so GitHub Pages repo subpath works)
  const rawBase = (import.meta as any).env?.BASE_URL || './';
  const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
  const logoSrc = `${base}marcille.png`;

  const validYears = entries.map((e) => e.anime_year).filter(Boolean);
  const minYear = validYears.length ? Math.min(...validYears) : 0;
  const maxYear = validYears.length ? Math.max(...validYears) : 0;

  const uniqueArtists = new Set(entries.map((e) => e.artist.trim()).filter(Boolean)).size;

  return (
    <header className="border-b border-neutral-800 bg-[#1c1e20] sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-2 sm:gap-4">
        {/* Navigation & Brand Icon */}
        <div className="flex items-center gap-2 sm:gap-3 w-full lg:w-auto min-w-0">
          {/* Brand Logo (Marcille) */}
          {!imgHasError ? (
            <img
              src={logoSrc}
              alt="Marcille"
              className="hidden sm:block h-9 w-auto rounded-lg border border-emerald-500/40 bg-neutral-900 shadow-sm flex-shrink-0"
              onError={() => setImgHasError(true)}
            />
          ) : (
            <div className="hidden sm:flex w-9 h-9 rounded-lg border border-emerald-500/40 bg-neutral-900 flex-shrink-0 items-center justify-center text-emerald-400">
              <Disc3 className="w-4 h-4" />
            </div>
          )}

          {/* Catalog / Collection Switcher */}
          <nav aria-label="Main navigation" className="grid grid-cols-3 sm:flex flex-1 lg:flex-none items-center bg-neutral-900/90 border border-neutral-800 p-1 rounded-lg text-xs font-medium min-w-0">
            <button
              type="button"
              onClick={() => onModeChange('anisongdb')}
              aria-pressed={mode === 'anisongdb' || mode === 'animethemes'}
              className={`flex min-h-11 min-w-0 justify-center items-center gap-1 sm:gap-1.5 px-1 sm:px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                mode === 'anisongdb' || mode === 'animethemes'
                  ? 'bg-emerald-500 text-neutral-950 font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Globe className="hidden sm:block w-3.5 h-3.5 shrink-0" />
              <span>Catalog</span>
            </button>

            <button
              type="button"
              onClick={() => onModeChange('collection')}
              aria-label={`My Collection (${entries.length})`}
              aria-pressed={mode === 'collection'}
              className={`flex min-h-11 min-w-0 justify-center items-center gap-1 sm:gap-1.5 px-1 sm:px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                mode === 'collection'
                  ? 'bg-emerald-500 text-neutral-950 font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Music className="hidden sm:block w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">My Collection</span>
              <span className="sm:hidden">Collection</span>
              <span className={`hidden sm:inline text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
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
              className={`flex min-h-11 min-w-0 justify-center items-center gap-1 sm:gap-1.5 px-1 sm:px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                mode === 'notes'
                  ? 'bg-amber-400 text-neutral-950 font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <StickyNote className="hidden sm:block w-3.5 h-3.5 shrink-0" />
              <span>Notes</span>
              <span className={`hidden sm:inline text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                mode === 'notes'
                  ? 'bg-neutral-950/20 text-neutral-900 font-bold'
                  : 'bg-neutral-800 text-neutral-400'
              }`}>
                {noteCount}
              </span>
            </button>
          </nav>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-end gap-2.5 w-full lg:w-auto">
          <div className="flex flex-col items-end gap-1">
            <div role="group" aria-label="Anime title language" className="flex items-center rounded-lg border border-neutral-700 bg-neutral-900 p-0.5">
              {(['en', 'jp'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-label={value === 'en' ? 'English anime titles' : 'Japanese romaji anime titles'}
                  aria-pressed={language === value}
                  title={value === 'en' ? 'English anime titles' : 'Japanese titles in romaji (Latin letters)'}
                  onClick={() => setLanguage(value)}
                  className={`min-h-11 min-w-11 rounded-md text-xs font-semibold cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-emerald-400 ${language === value ? 'bg-emerald-500 text-neutral-950' : 'text-neutral-400 hover:text-white'}`}
                >{value.toUpperCase()}</button>
              ))}
            </div>
            {storageError && <span role="status" className="text-xs text-amber-300">Title preference could not be saved.</span>}
          </div>
          <button
            id="data-mgmt-btn"
            type="button"
            onClick={onOpenDataModal}
            aria-label="Manage data"
            className="flex min-h-11 min-w-11 justify-center items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-300 bg-neutral-800/80 hover:bg-neutral-700/80 hover:text-white border border-neutral-700/60 transition-all cursor-pointer"
          >
            <Database className="w-3.5 h-3.5 text-neutral-400" />
            <span className="hidden sm:inline">Manage Data</span>
          </button>

          <button
            id="header-add-song-btn"
            type="button"
            onClick={onOpenAddModal}
            className="flex min-h-11 min-w-11 justify-center items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-neutral-950 bg-emerald-400 hover:bg-emerald-300 active:scale-98 shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Song</span>
          </button>
        </div>
      </div>
    </header>
  );
};
