import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Header } from './components/Header';
import { FilterBar } from './components/FilterBar';
import { SongTable } from './components/SongTable';
import { AddSongModal } from './components/AddSongModal';
import { EditSongModal } from './components/EditSongModal';
import { DataModal } from './components/DataModal';
import { VideoModal } from './components/VideoModal';
import { NoteModal } from './components/NoteModal';
import {
  AnimeSongEntry,
  AnimeSongItem,
  DatabaseMode,
  NoteMap,
  NoteSongSnapshot,
  PersonalSongNote,
  SortKey,
  SortOrder,
} from './types';
import {
  fetchEntries,
  createEntry,
  updateEntry,
  deleteEntry,
  importEntries,
  resetEntriesToDefault,
} from './services/api';
import { loadStaticCatalog, searchStaticCatalog } from './services/catalogEngine';
import {
  NOTES_STORAGE_KEY,
  clearAllNotes,
  clearNote,
  findNoteForSong,
  getSongNoteKey,
  loadNotes,
  saveNotes,
  upsertNote,
} from './services/notesStorage';
import { PlayerProvider } from './context/PlayerContext';
import { MusicPlayer } from './components/player/MusicPlayer';
import { PlayCollectionBar } from './components/collection/CollectionPlayButtons';
import { SongTrack } from './types/player';
import { CheckCircle2, AlertCircle } from 'lucide-react';

type NoteableSong = AnimeSongEntry | AnimeSongItem | NoteSongSnapshot;

function matchesSearchText(values: Array<unknown>, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const searchableText = values.map((value) => String(value ?? '').toLowerCase()).join(' ');
  return terms.every((term) => searchableText.includes(term));
}

function sortSongItems<T extends NoteableSong>(
  items: T[],
  sortKey: SortKey,
  sortOrder: SortOrder
): T[] {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  return [...items].sort((a, b) => {
    const valA = (a as any)[sortKey];
    const valB = (b as any)[sortKey];

    if (sortKey === 'anime_year') {
      const numA = Number(valA) || 0;
      const numB = Number(valB) || 0;
      if (numA !== numB) return sortOrder === 'asc' ? numA - numB : numB - numA;
      return collator.compare(String(a.anime_name || ''), String(b.anime_name || ''));
    }

    if (sortKey === 'id') {
      const numA = typeof valA === 'string' ? parseInt(valA.replace(/\D/g, ''), 10) : Number(valA);
      const numB = typeof valB === 'string' ? parseInt(valB.replace(/\D/g, ''), 10) : Number(valB);
      if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
        return sortOrder === 'asc' ? numA - numB : numB - numA;
      }
    }

    if (valA === undefined || valA === null) return sortOrder === 'asc' ? 1 : -1;
    if (valB === undefined || valB === null) return sortOrder === 'asc' ? -1 : 1;
    if (typeof valA === 'number' && typeof valB === 'number') {
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    }

    const compared = collator.compare(String(valA), String(valB));
    return sortOrder === 'asc' ? compared : -compared;
  });
}

function MainApp() {
  // Database Mode: 'anisongdb' (38,800+ tracks) vs 'collection' (local private library)
  const [mode, setMode] = useState<DatabaseMode>('anisongdb');
  const isCatalogMode = mode === 'anisongdb' || mode === 'animethemes';

  // Collection entries
  const [collectionEntries, setCollectionEntries] = useState<AnimeSongEntry[]>([]);
  const [isLoadingCollection, setIsLoadingCollection] = useState(true);

  // AniSongDB live catalog state
  const [anisongdbSongs, setAnisongdbSongs] = useState<AnimeSongItem[]>([]);
  const [isLoadingAniSongDb, setIsLoadingAniSongDb] = useState(false);
  const [aniSongDbTotal, setAniSongDbTotal] = useState(38821);

  // Fallback catalog lookup map for collection songs missing video_url
  const [catalogLookupMap, setCatalogLookupMap] = useState<Map<string, AnimeSongItem>>(new Map());

  useEffect(() => {
    loadStaticCatalog()
      .then(([catalog]) => {
        if (catalog && catalog.length > 0) {
          const map = new Map<string, AnimeSongItem>();
          for (const c of catalog) {
            if (!c.video_url && !c.audio_url) continue;
            const aKey = (c.anime_name || '').toLowerCase().trim();
            const sKey = `${aKey}:::${(c.song_name || '').toLowerCase().trim()}`;
            if (!map.has(sKey)) map.set(sKey, c);
            if (!map.has(aKey)) map.set(aKey, c);
          }
          setCatalogLookupMap(map);
        }
      })
      .catch(() => {});
  }, []);

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
  const [activeNoteSong, setActiveNoteSong] = useState<NoteableSong | null>(null);

  // Personal notes never leave this browser.
  const [notes, setNotes] = useState<NoteMap>(() => loadNotes());

  // Keep multiple tabs of the same browser profile in sync.
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === NOTES_STORAGE_KEY || event.key === null) {
        setNotes(loadNotes());
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

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
    if (!isCatalogMode) return;

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
        // Search the bundled catalog locally so a query that also appears in a
        // private note is never transmitted to the server.
        const res = await searchStaticCatalog({
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
  }, [mode, isCatalogMode, debouncedSearch, selectedMinYear, selectedMaxYear, themeTypeFilter, sortKey, sortOrder]);

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
      // Each modal owns its own keyboard behavior. Do not let global shortcuts
      // focus the page behind a dialog or stack another dialog on top.
      if (isAddOpen || isDataOpen || editingEntry || activeVideoSong || activeNoteSong) {
        return;
      }

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
  }, [isAddOpen, isDataOpen, editingEntry, activeVideoSong, activeNoteSong]);

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
    const q = debouncedSearch.trim();

    const filtered = collectionEntries.filter((item) => {
      const personalNote = findNoteForSong(notes, item);
      const matchesSearch = matchesSearchText(
        [item.anime_name, item.artist, item.song_name, item.theme_type, personalNote?.text],
        q
      );

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
  }, [collectionEntries, notes, debouncedSearch, selectedMinYear, selectedMaxYear, sortKey, sortOrder]);

  // Map collection items to SongTrack format for persistent Spotify-style audio/video playback
  const collectionTracks = useMemo<SongTrack[]>(() => {
    const tracks: SongTrack[] = [];
    for (const item of filteredAndSortedCollection) {
      let videoUrl = item.video_url;
      if (!videoUrl && catalogLookupMap.size > 0) {
        const aKey = (item.anime_name || '').toLowerCase().trim();
        const sKey = `${aKey}:::${(item.song_name || '').toLowerCase().trim()}`;
        const match = catalogLookupMap.get(sKey) || catalogLookupMap.get(aKey);
        if (match?.video_url) {
          videoUrl = match.video_url;
        }
      }

      if (videoUrl) {
        tracks.push({
          id: item.id,
          animeTitle: item.anime_name,
          songName: item.song_name || undefined,
          artist: item.artist || undefined,
          type: item.theme_type || undefined,
          videoUrl: videoUrl,
        });
      }
    }
    return tracks;
  }, [filteredAndSortedCollection, catalogLookupMap]);

  const collectionTracksMap = useMemo(() => {
    const map = new Map<string | number, SongTrack>();
    for (const track of collectionTracks) {
      map.set(String(track.id), track);
      map.set(Number(track.id), track);
    }
    return map;
  }, [collectionTracks]);

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
      theme_type: song.theme_type,
      video_url: song.video_url || undefined,
      source_song_id: String(song.id),
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

  const handleImportData = async (imported: AnimeSongEntry[], importedNotes: NoteMap) => {
    const result = await importEntries(imported);
    setCollectionEntries(result);
    if (!saveNotes(importedNotes)) {
      throw new Error('Songs were imported, but this browser could not save the personal notes.');
    }
    setNotes(importedNotes);
    showToast(`Imported ${result.length} songs and ${Object.keys(importedNotes).length} notes`);
  };

  const handleReset = async () => {
    const result = await resetEntriesToDefault();
    setCollectionEntries(result);
    setSelectedMinYear(1980);
    setSelectedMaxYear(2026);
    showToast('Collection reset to empty');
  };

  const handleSaveNote = (song: NoteableSong, text: string) => {
    const updatedNotes = upsertNote(notes, song, text);
    setNotes(updatedNotes);
    setActiveNoteSong(null);
    showToast('Personal note saved in this browser');
  };

  const handleClearNote = (song: NoteableSong) => {
    const updatedNotes = clearNote(notes, song);
    setNotes(updatedNotes);
    setActiveNoteSong(null);
    showToast('Personal note removed', 'info');
  };

  const handleClearAllNotes = () => {
    if (!clearAllNotes()) {
      throw new Error('This browser could not clear its personal notes. Check site-data permissions.');
    }
    setNotes({});
    setActiveNoteSong(null);
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

  const noteRecords = useMemo(
    () => (Object.values(notes) as PersonalSongNote[]).filter((note) => note.text.trim().length > 0),
    [notes]
  );

  // The Notes tab is completely local and uses the stored song snapshot, so notes
  // remain useful even if a song is later removed from My Collection.
  const filteredAndSortedNotes = useMemo(() => {
    const filtered = noteRecords.filter((note) => {
      const song = note.song;
      const year = Number(song.anime_year);
      const matchesYear = !year || (year >= selectedMinYear && year <= selectedMaxYear);
      const matchesQuery = matchesSearchText(
        [song.anime_name, song.artist, song.song_name, song.theme_type, note.text],
        debouncedSearch
      );
      return matchesYear && matchesQuery;
    });

    return sortSongItems(filtered.map((note) => note.song), sortKey, sortOrder);
  }, [noteRecords, debouncedSearch, selectedMinYear, selectedMaxYear, sortKey, sortOrder]);

  // Match note contents locally and merge them with the bundled catalog results.
  const catalogNoteMatches = useMemo(() => {
    if (!debouncedSearch.trim()) return [] as AnimeSongItem[];

    return noteRecords
      .filter((note) => note.songKey.startsWith('catalog:'))
      .filter((note) => {
        const song = note.song;
        const year = Number(song.anime_year);
        if (year && (year < selectedMinYear || year > selectedMaxYear)) return false;

        const theme = String(song.theme_type || '').toUpperCase();
        if (themeTypeFilter === 'OP' && !(theme.startsWith('OP') || theme.includes('OPENING'))) return false;
        if (themeTypeFilter === 'ED' && !(theme.startsWith('ED') || theme.includes('ENDING'))) return false;
        if (themeTypeFilter === 'IN' && !(theme.startsWith('IN') || theme.includes('INSERT'))) return false;

        return matchesSearchText(
          [song.anime_name, song.artist, song.song_name, song.theme_type, note.text],
          debouncedSearch
        );
      })
      .map((note) => note.song as AnimeSongItem);
  }, [noteRecords, debouncedSearch, selectedMinYear, selectedMaxYear, themeTypeFilter]);

  const mergedCatalogSongs = useMemo(() => {
    const merged = new Map<string, AnimeSongItem>();
    for (const song of anisongdbSongs) merged.set(getSongNoteKey(song), song);
    for (const song of catalogNoteMatches) {
      const key = getSongNoteKey(song);
      if (!merged.has(key)) merged.set(key, song);
    }
    return Array.from(merged.values());
  }, [anisongdbSongs, catalogNoteMatches]);

  const sortedCatalogSongs = useMemo(
    () => sortSongItems(mergedCatalogSongs, sortKey, sortOrder),
    [mergedCatalogSongs, sortKey, sortOrder]
  );

  const catalogLocalOnlyCount = Math.max(0, mergedCatalogSongs.length - anisongdbSongs.length);
  const currentDisplayList = isCatalogMode
    ? sortedCatalogSongs
    : mode === 'collection'
      ? filteredAndSortedCollection
      : filteredAndSortedNotes;

  const totalFilteredCount = currentDisplayList.length;
  const totalItemsCount = isCatalogMode
    ? aniSongDbTotal + catalogLocalOnlyCount
    : mode === 'collection'
      ? collectionEntries.length
      : noteRecords.length;

  const isLoading = isCatalogMode
    ? isLoadingAniSongDb
    : mode === 'collection'
      ? isLoadingCollection
      : false;

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
          } else if (newMode === 'notes') {
            showToast('Showing your private browser notes', 'info');
          } else {
            showToast('Switched to Catalog');
          }
        }}
        noteCount={noteRecords.length}
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
              ? 'Search anime, artist, song title, or your notes... (Press / to focus)'
              : mode === 'collection'
                ? 'Search your collection and personal notes... (Press / to focus)'
                : 'Search your notes, anime, songs, or artists... (Press / to focus)'
          }
        />

        {/* Play Collection Bar (in My Collection view) */}
        {mode === 'collection' && !isLoading && (
          <PlayCollectionBar
            tracks={collectionTracks}
            className="mb-4"
          />
        )}

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
            notes={notes}
            onEditNote={(song) => setActiveNoteSong(song)}
            isNotesMode={mode === 'notes'}
            tracksMap={mode === 'collection' ? collectionTracksMap : undefined}
            allTracks={mode === 'collection' ? collectionTracks : undefined}
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

      <NoteModal
        isOpen={Boolean(activeNoteSong)}
        song={activeNoteSong}
        note={activeNoteSong ? findNoteForSong(notes, activeNoteSong) : undefined}
        onClose={() => setActiveNoteSong(null)}
        onSave={handleSaveNote}
        onClear={handleClearNote}
      />

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
        notes={notes}
        onImportData={handleImportData}
        onResetToDefault={handleReset}
        onClearNotes={handleClearAllNotes}
      />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-24 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-100 shadow-xl animate-in slide-in-from-bottom-3 duration-200 text-xs">
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Persistent Anime Music Player */}
      <MusicPlayer />
    </div>
  );
}

export default function App() {
  return (
    <PlayerProvider>
      <MainApp />
    </PlayerProvider>
  );
}
