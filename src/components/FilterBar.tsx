import { ANIME_SEASONS } from '../services/animeSeason';
import React from 'react';
import { Search, Share2, X, RotateCcw, Calendar, UserRound } from 'lucide-react';
import { ActiveArtistFilter } from '../types';
import { DualRangeSlider } from './DualRangeSlider';

interface FilterBarProps {
  seasonFilter: string;
  onSeasonChange: (value: string) => void;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  minYear: number;
  maxYear: number;
  selectedMinYear: number;
  selectedMaxYear: number;
  onYearRangeChange: (min: number, max: number) => void;
  totalFiltered: number;
  totalItems: number;
  onResetFilters: () => void;
  themeTypeFilter?: string;
  onThemeTypeChange?: (val: string) => void;
  placeholderText?: string;
  activeArtistFilter?: ActiveArtistFilter | null;
  onClearArtistFilter?: () => void;
  onShareSearch?: () => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  seasonFilter,
  onSeasonChange,
  searchQuery,
  onSearchChange,
  minYear,
  maxYear,
  selectedMinYear,
  selectedMaxYear,
  onYearRangeChange,
  totalFiltered,
  totalItems,
  onResetFilters,
  themeTypeFilter,
  onThemeTypeChange,
  placeholderText = 'Search anime title, artist, or song name... (Press / to focus)',
  activeArtistFilter,
  onClearArtistFilter,
  onShareSearch,
}) => {
  const isFiltered =
    seasonFilter !== 'ALL' ||
    searchQuery.trim() !== '' ||
    Boolean(activeArtistFilter) ||
    selectedMinYear > minYear ||
    selectedMaxYear < maxYear ||
    (themeTypeFilter && themeTypeFilter !== 'ALL');

  const decadePresets = [
    { label: 'All', min: minYear, max: maxYear },
    { label: '80s', min: 1980, max: 1989 },
    { label: '90s', min: 1990, max: 1999 },
    { label: '2000s', min: 2000, max: 2009 },
    { label: '2010s', min: 2010, max: 2019 },
    { label: '2020s', min: 2020, max: maxYear },
  ];

  return (
    <div className="bg-[#232628] border border-neutral-800 rounded-xl p-4 shadow-sm mb-5 space-y-4">
      {/* Top row: Search and Match Count */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
        {/* Search Bar */}
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            id="search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={placeholderText}
            className="w-full pl-10 pr-10 py-2.5 bg-neutral-900/90 border border-neutral-700/80 rounded-lg text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all"
          />
          {searchQuery && (
            <button
              id="clear-search-btn"
              onClick={() => onSearchChange('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Theme Type pills (All / OP / ED / Insert) if provided */}
        {onThemeTypeChange && (
          <div className="flex items-center gap-1 bg-neutral-900/90 border border-neutral-700/80 rounded-lg p-1 text-xs">
            {[
              { id: 'ALL', label: 'All Themes' },
              { id: 'OP', label: 'Openings' },
              { id: 'ED', label: 'Endings' },
              { id: 'IN', label: 'Insert Songs' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => onThemeTypeChange(t.id)}
                className={`px-3 py-1.5 rounded-md font-medium transition-all cursor-pointer ${
                  (themeTypeFilter || 'ALL') === t.id
                    ? 'bg-emerald-500/25 text-emerald-300 font-semibold shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Status Count & Reset */}
        <div className="flex items-center justify-between md:justify-end gap-3 text-xs">
          <div className="text-neutral-400">
            Showing{' '}
            <span className="font-semibold text-emerald-400">
              {totalFiltered}
            </span>{' '}
            of <span className="font-medium text-neutral-300">{totalItems}</span>
          </div>

          {isFiltered && (
            <button
              id="reset-filters-btn"
              onClick={onResetFilters}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700 transition-colors border border-neutral-700/60 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}
          {onShareSearch && (
            <button type="button" onClick={onShareSearch}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-700/60 bg-neutral-800 px-2.5 py-1.5 text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white"
              aria-label="Share this catalog search">
              <Share2 className="h-3.5 w-3.5" />
              <span>Share search</span>
            </button>
          )}
        </div>
      </div>

      {activeArtistFilter && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-700/50 bg-emerald-950/25 px-3 py-2 text-xs">
          <UserRound className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-neutral-400">Exact artist</span>
          <span className="font-semibold text-emerald-300">{activeArtistFilter.label}</span>
          <span
            className="rounded bg-neutral-900/70 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500"
            title={`AnisongDB artist ID${activeArtistFilter.ids.length === 1 ? '' : 's'}: ${activeArtistFilter.ids.join(', ')}`}
          >
            ID match
          </span>
          {onClearArtistFilter && (
            <button
              type="button"
              onClick={onClearArtistFilter}
              className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
              aria-label={`Clear exact artist filter for ${activeArtistFilter.label}`}
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
        </div>
      )}

      {/* Bottom row: Single 2-Knob Year Range Slider & Decade Presets */}
      <div className="pt-2 border-t border-neutral-800/80 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 text-xs">
        {/* Sliders and Range Labels */}
        <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
          <div className="flex items-center gap-2 text-neutral-300 font-medium">
            <Calendar className="w-3.5 h-3.5 text-emerald-400" />
            <span>Anime Year:</span>
            <span className="font-semibold text-emerald-400 bg-neutral-900 border border-neutral-800 px-2 py-0.5 rounded">
              {selectedMinYear} – {selectedMaxYear}
            </span>
          </div>

          <label className="flex items-center gap-2 text-neutral-300" title="The anime's catalog season, not the song's release date">
            Anime season
            <select aria-label="Anime season" value={seasonFilter} onChange={(event) => onSeasonChange(event.target.value)}
              className="min-h-11 rounded-lg border border-neutral-700 bg-neutral-900 px-2 text-neutral-100 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500">
              <option value="ALL">All seasons</option>
              {ANIME_SEASONS.map((season) => <option key={season} value={season}>{season}</option>)}
            </select>
          </label>

          {/* Single Continuous Slider with 2 Draggable Knobs */}
          <div className="flex items-center gap-2 flex-1 sm:flex-initial">
            <span className="text-[11px] font-mono text-neutral-500">{minYear}</span>
            <DualRangeSlider
              min={minYear}
              max={maxYear}
              selectedMin={selectedMinYear}
              selectedMax={selectedMaxYear}
              onChange={onYearRangeChange}
              className="w-44 sm:w-56 h-6"
            />
            <span className="text-[11px] font-mono text-neutral-500">{maxYear}</span>
          </div>
        </div>

        {/* Decade Presets */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 w-full lg:w-auto">
          <span className="text-neutral-500 mr-1 text-[11px]">Decade:</span>
          {decadePresets.map((preset) => {
            const isActive =
              selectedMinYear === preset.min && selectedMaxYear === preset.max;
            return (
              <button
                key={preset.label}
                onClick={() => onYearRangeChange(preset.min, preset.max)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-neutral-800/80 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700/80 border border-neutral-800'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
