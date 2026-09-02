import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { FilterBar } from './components/FilterBar';
import { SongTable } from './components/SongTable';
import { AddSongModal } from './components/AddSongModal';
import { EditSongModal } from './components/EditSongModal';
import { DataModal } from './components/DataModal';
import { VideoModal } from './components/VideoModal';
import { AnimeSongEntry, AnimeSongItem, DatabaseMode, SortKey, SortOrder } from './types';
import {
  fetchEntries,
  createEntry,
  updateEntry,
  deleteEntry,
  importEntries,
  resetEntriesToDefault,
  fetchAniSongDbSongs,
} from './services/api';
import { CheckCircle2, AlertCircle, Sparkles, Globe, Music, RefreshCw, Flame } from 'lucide-react';
import initialNewestSongs from './data/initial_songs.json';

export default function App() {
  // Database Mode: 'anisongdb' (38,800+ tracks) vs 'collection' (local private library)
  const [mode, setMode] = useState<DatabaseMode>('anisongdb');

  // Collection entries
  const [collectionEntries, setCollectionEntries] = useState<AnimeSongEntry[]>([]);
  const [isLoadingCollection, setIsLoadingCollection] = useState(true);

  // AniSongDB live catalog state - pre-populated with newest 2026 tracks for instant display
  const [anisongdbSongs, setAnisongdbSongs] = useState<AnimeSongItem[]>(initialNewestSongs as AnimeSongItem[]);
  const [isLoadingAniSongDb, setIsLoadingAniSongDb] = useState(false);
  const [aniSongDbTotal, setAniSongDbTotal] = useState(38821);

  // Filters and Sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [themeTypeFilter, setThemeTypeFilter] = useState('ALL'); // ALL, OP, ED, IN
  const [sortKey, setSortKey] = useState<SortKey>('anime_year');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Year Bounds: 1980 to 2026 (Supports upcoming 2026 songs!)
  const [selectedMinYear, setSelectedMinYear] = useState<number>(1980);
  const [selectedMaxYear, setSelectedMaxYear] = useState<number>(2026);

  // Modals
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isDataOpen, setIsDataOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<AnimeSongEntry | null>(null);
  const [activeVideoSong, setActiveVideoSong] = useState<AnimeSongItem | null>(null);

  // Toast notifications
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  // Initial load of local collection
  useEffect(() => {
    async function loadCollection() {
      setIsLoadingCollection(true);
      try {
        const data = await fetchEntries();
        setCollectionEntries(data);
      } catch (err) {
        console.error('Failed to load anime entries', err);
      } finally {
        setIsLoadingCollection(false);
      }
    }
    loadCollection();
  }, []);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Track previous filter parameters to differentiate between filter changes vs pure sorting
  const prevFiltersRef = useRef({
    search: debouncedSearch,
    minYear: selectedMinYear,
    maxYear: selectedMaxYear,
    theme: themeTypeFilter,
    mode,
  });
  const hasLoadedInitialCatalogRef = useRef(false);

  // Fetch AniSongDB live catalog songs whenever search, years, theme type, or sorting changes
  useEffect(() => {
    if (mode === 'collection') return;

    let isMounted = true;
    const isInitial = !hasLoadedInitialCatalogRef.current;
    const filterChanged =
      isInitial ||
      prevFiltersRef.current.search !== debouncedSearch ||
      prevFiltersRef.current.minYear !== selectedMinYear ||
      prevFiltersRef.current.maxYear !== selectedMaxYear ||
      prevFiltersRef.current.theme !== themeTypeFilter ||
      prevFiltersRef.current.mode !== mode;

    hasLoadedInitialCatalogRef.current = true;
    prevFiltersRef.current = {
      search: debouncedSearch,
      minYear: selectedMinYear,
      maxYear: selectedMaxYear,
      theme: themeTypeFilter,
      mode,
    };

    // Only show full loading spinner when filtering/searching changes after initial mount.
    // On first arrival, the newest 2026 songs are already loaded instantly without any spinner!
    if (filterChanged && !isInitial) {
      setIsLoadingAniSongDb(true);
    }

    async function fetchCatalog() {
      try {
        const res = await fetchAniSongDbSongs({
          q: debouncedSearch.trim() || undefined,
          yearMin: selectedMinYear,
          yearMax: selectedMaxYear,
          themeType: themeTypeFilter,
          limit: debouncedSearch.trim() ? 250 : 80,
          sortKey,
          sortOrder,
        });

        if (isMounted && res.data) {
          setAnisongdbSongs(res.data);
          setAniSongDbTotal(res.total || res.data.length);
        }
      } catch (err) {
        console.error('Failed to fetch from AniSongDB', err);
      } finally {
        if (isMounted && filterChanged) {
          setIsLoadingAniSongDb(false);
        }
      }
    }

    fetchCatalog();
    return () => {
      isMounted = false;
    };
  }, [mode, debouncedSearch, selectedMinYear, selectedMaxYear, themeTypeFilter, sortKey, sortOrder]);

  // Set of keys for songs already saved in collection
  const savedSongKeys = useMemo(() => {
    const set = new Set<string>();
    for (const item of collectionEntries) {
      const key = `${(item.anime_name || '').toLowerCase()}:::${(item.song_name || '').toLowerCase()}`;
      set.add(key);
    }
    return set;
  }, [collectionEntries]);

  // Keyboard shortcut listener (/ for search, N for new song)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur();
        }
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        document.getElementById('search-input')?.focus();
      } else if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setIsAddOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Sorting handler - cleanly toggle between ascending and descending
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortOrder(key === 'anime_year' ? 'desc' : 'asc');
    }
  };

  // Filter and Sort local collection entries
  const filteredAndSortedCollection = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();

    const filtered = collectionEntries.filter((item) => {
      const matchesSearch =
        !q ||
        (item.anime_name?.toLowerCase() ?? '').includes(q) ||
        (item.artist?.toLowerCase() ?? '').includes(q) ||
        (item.song_name?.toLowerCase() ?? '').includes(q);

      const year = Number(item.anime_year);
      const matchesYear =
        !year || (year >= selectedMinYear && year <= selectedMaxYear);

      return matchesSearch && matchesYear;
    });

    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    return filtered.sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];

      if (valA === undefined || valA === null) return sortOrder === 'asc' ? 1 : -1;
      if (valB === undefined || valB === null) return sortOrder === 'asc' ? -1 : 1;

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }

      const cmp = collator.compare(String(valA), String(valB));
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [collectionEntries, debouncedSearch, selectedMinYear, selectedMaxYear, sortKey, sortOrder]);

  // Handlers for Add, Edit, Delete in collection
  const handleAddSong = async (newSong: Omit<AnimeSongEntry, 'id'>) => {
    const created = await createEntry(newSong);
    setCollectionEntries((prev) => [...prev, created]);
    showToast(`Added "${created.song_name || created.anime_name}" to your collection`);
  };

  const handleSaveFromAniSongDb = async (song: AnimeSongItem) => {
    const newEntry = {
      anime_name: song.anime_name,
      anime_year: Number(song.anime_year) || 2024,
      artist: song.artist || 'Unknown Artist',
      song_name: song.song_name || 'Unknown Title',
    };
    const created = await createEntry(newEntry);
    setCollectionEntries((prev) => [...prev, created]);
    showToast(`Saved "${song.song_name}" to your collection!`);
  };

  const handleEditSave = async (id: number, updatedFields: Partial<AnimeSongEntry>) => {
    const updated = await updateEntry(id, updatedFields);
    setCollectionEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));
    showToast(`Updated "${updated.anime_name}"`);
  };

  const handleDelete = async (id: number) => {
    const item = collectionEntries.find((e) => e.id === id);
    if (!window.confirm(`Are you sure you want to delete "${item?.song_name || item?.anime_name}"?`)) {
      return;
    }
    await deleteEntry(id);
    setCollectionEntries((prev) => prev.filter((e) => e.id !== id));
    showToast('Entry deleted from collection', 'info');
  };

  const handleImport = async (imported: AnimeSongEntry[]) => {
    const result = await importEntries(imported);
    setCollectionEntries(result);
    showToast(`Imported ${result.length} songs`);
  };

  const handleReset = async () => {
    const result = await resetEntriesToDefault();
    setCollectionEntries(result);
    setSelectedMinYear(1980);
    setSelectedMaxYear(2026);
    showToast('Restored initial 67 anime tracks');
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setDebouncedSearch('');
    setSelectedMinYear(1980);
    setSelectedMaxYear(2026);
    setThemeTypeFilter('ALL');
    setSortKey('anime_year');
    setSortOrder('desc');
  };

  const isCatalogMode = mode !== 'collection';

  // Sort catalog songs by current sort key and order
  const sortedCatalogSongs = useMemo(() => {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    return [...anisongdbSongs].sort((a, b) => {
      const valA = (a as any)[sortKey];
      const valB = (b as any)[sortKey];

      if (sortKey === 'anime_year') {
        const numA = Number(valA) || 0;
        const numB = Number(valB) || 0;
        if (numA !== numB) {
          return sortOrder === 'asc' ? numA - numB : numB - numA;
        }
        return collator.compare(String(a.anime_name || ''), String(b.anime_name || ''));
      }

      if (sortKey === 'id') {
        const numA = typeof valA === 'string' ? parseInt(valA.replace(/\D/g, ''), 10) : Number(valA);
        const numB = typeof valB === 'string' ? parseInt(valB.replace(/\D/g, ''), 10) : Number(valB);
        if (!isNaN(numA) && !isNaN(numB)) {
          return sortOrder === 'asc' ? numA - numB : numB - numA;
        }
      }

      if (valA === undefined || valA === null) return sortOrder === 'asc' ? 1 : -1;
      if (valB === undefined || valB === null) return sortOrder === 'asc' ? -1 : 1;

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }

      const cmp = collator.compare(String(valA), String(valB));
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [anisongdbSongs, sortKey, sortOrder]);

  const currentDisplayList =
    isCatalogMode ? sortedCatalogSongs : filteredAndSortedCollection;

  const totalFilteredCount =
    isCatalogMode ? anisongdbSongs.length : filteredAndSortedCollection.length;

  const totalItemsCount =
    isCatalogMode ? aniSongDbTotal : collectionEntries.length;

  const isLoading = isCatalogMode ? isLoadingAniSongDb : isLoadingCollection;

  return (
    <div className="min-h-screen bg-[#181a1b] text-neutral-200 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-300">
      {/* Top Navigation Bar with AniSongDB / Collection Mode Switcher */}
      <Header
        entries={collectionEntries}
        onOpenAddModal={() => setIsAddOpen(true)}
        onOpenDataModal={() => setIsDataOpen(true)}
        mode={mode}
        onModeChange={(newMode) => {
          setMode(newMode);
          if (newMode === 'collection') {
            showToast('Switched to My Collection');
          } else {
            showToast('Switched to Catalog');
          }
        }}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5">
        {/* Filter Controls with Dual-Knob Year Range Slider up to 2026 */}
        <FilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          minYear={1980}
          maxYear={2026}
          selectedMinYear={selectedMinYear}
          selectedMaxYear={selectedMaxYear}
          onYearRangeChange={(min, max) => {
            setSelectedMinYear(min);
            setSelectedMaxYear(max);
          }}
          totalFiltered={totalFilteredCount}
          totalItems={totalItemsCount}
          onResetFilters={handleResetFilters}
          themeTypeFilter={isCatalogMode ? themeTypeFilter : undefined}
          onThemeTypeChange={isCatalogMode ? setThemeTypeFilter : undefined}
          placeholderText={
            isCatalogMode
              ? 'Search by anime, artist, or song title... (Press / to focus)'
              : 'Search your collection by anime, song, or artist... (Press / to focus)'
          }
        />

        {/* Data Table */}
        {isLoading ? (
          <div className="bg-[#232628] border border-neutral-800 rounded-xl p-16 text-center shadow-sm flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
            <span className="text-xs text-neutral-400">
              {isCatalogMode
                ? 'Searching catalog...'
                : 'Loading saved collection...'}
            </span>
          </div>
        ) : (
          <SongTable
            entries={currentDisplayList}
            sortKey={sortKey}
            sortOrder={sortOrder}
            onSort={handleSort}
            onEdit={mode === 'collection' ? (item) => setEditingEntry(item) : undefined}
            onDelete={mode === 'collection' ? handleDelete : undefined}
            searchQuery={debouncedSearch}
            isAniSongDbMode={isCatalogMode}
            onSaveToCollection={handleSaveFromAniSongDb}
            savedSongKeys={savedSongKeys}
            onPlayVideo={(song) => setActiveVideoSong(song)}
          />
        )}

        {/* Footer Info */}
        <footer className="mt-8 pt-4 border-t border-neutral-800/80 flex flex-col sm:flex-row items-center justify-between text-xs text-neutral-500 gap-2">
          <div className="flex items-center gap-2">
            <span>Local Catalog &bull; 33,500+ tracks (1980 – 2026)</span>
          </div>
          <div>
            <span>Press </span>
            <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-300 text-[11px] font-mono">
              /
            </kbd>
            <span> to search, </span>
            <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-300 text-[11px] font-mono">
              N
            </kbd>
            <span> to add song</span>
          </div>
        </footer>
      </main>

      {/* Video / Audio Playback Modal */}
      {activeVideoSong && (
        <VideoModal
          isOpen={Boolean(activeVideoSong)}
          onClose={() => setActiveVideoSong(null)}
          song={activeVideoSong}
        />
      )}

      {/* Add / Edit / Manage Modals */}
      <AddSongModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onAddSong={handleAddSong}
      />

      <EditSongModal
        isOpen={Boolean(editingEntry)}
        entry={editingEntry}
        onClose={() => setEditingEntry(null)}
        onSave={handleEditSave}
      />

      <DataModal
        isOpen={isDataOpen}
        onClose={() => setIsDataOpen(false)}
        entries={collectionEntries}
        onImportEntries={handleImport}
        onResetToDefault={handleReset}
      />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-100 shadow-xl animate-in slide-in-from-bottom-3 duration-200 text-xs">
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}

