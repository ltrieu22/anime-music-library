import React from 'react';
import { Music, Plus, Database, Sparkles, Disc3, Globe } from 'lucide-react';
import { AnimeSongEntry, DatabaseMode } from '../types';

interface HeaderProps {
  entries: AnimeSongEntry[];
  onOpenAddModal: () => void;
  onOpenDataModal: () => void;
  mode: DatabaseMode;
  onModeChange: (mode: DatabaseMode) => void;
  animeThemesCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  entries,
  onOpenAddModal,
  onOpenDataModal,
  mode,
  onModeChange,
  animeThemesCount = 0,
}) => {
  const [avatarSrc, setAvatarSrc] = React.useState<string>(() => {
    return localStorage.getItem('app_avatar') || '/marcille.png';
  });
  const [imgHasError, setImgHasError] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleAvatarFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setAvatarSrc(dataUrl);
      setImgHasError(false);
      try {
        localStorage.setItem('app_avatar', dataUrl);
      } catch (err) {
        console.warn('Avatar localStorage save failed:', err);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleAvatarFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleAvatarFile(file);
    }
  };

  const validYears = entries.map((e) => e.anime_year).filter(Boolean);
  const minYear = validYears.length ? Math.min(...validYears) : 0;
  const maxYear = validYears.length ? Math.max(...validYears) : 0;

  const uniqueArtists = new Set(entries.map((e) => e.artist.trim()).filter(Boolean)).size;

  return (
    <header className="border-b border-neutral-800 bg-[#1c1e20] sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
        {/* Navigation & Brand Icon */}
        <div className="flex items-center gap-3">
          {/* Top-Left Avatar Icon (Marcille) */}
          <div
            id="brand-avatar-icon"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="w-8 h-8 rounded-lg overflow-hidden border border-emerald-500/40 hover:border-emerald-400 bg-neutral-900 flex-shrink-0 flex items-center justify-center relative cursor-pointer group shadow-sm transition-all"
            title="Marcille avatar (Click or drop image file to update)"
          >
            {!imgHasError ? (
              <img
                src={avatarSrc}
                alt="Marcille"
                className="w-full h-full object-cover object-top transition-transform group-hover:scale-105"
                onError={() => setImgHasError(true)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-emerald-500/10 text-emerald-400">
                <Disc3 className="w-4 h-4" />
              </div>
            )}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleInputChange}
              accept="image/*"
              className="hidden"
            />
          </div>

          {/* Catalog / Collection Switcher */}
          <div className="flex items-center bg-neutral-900/90 border border-neutral-800 p-1 rounded-lg text-xs font-medium">
            <button
              onClick={() => onModeChange('anisongdb')}
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
              onClick={() => onModeChange('collection')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                mode === 'collection'
                  ? 'bg-emerald-500 text-neutral-950 font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Music className="w-3.5 h-3.5" />
              <span>My Collection</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                mode === 'collection' ? 'bg-neutral-950/20 text-neutral-900 font-bold' : 'bg-neutral-800 text-neutral-400'
              }`}>
                {entries.length}
              </span>
            </button>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          <button
            id="data-mgmt-btn"
            onClick={onOpenDataModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-300 bg-neutral-800/80 hover:bg-neutral-700/80 hover:text-white border border-neutral-700/60 transition-all cursor-pointer"
          >
            <Database className="w-3.5 h-3.5 text-neutral-400" />
            <span className="hidden sm:inline">Manage Data</span>
          </button>

          <button
            id="header-add-song-btn"
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

