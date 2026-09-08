import { SongShareProvider, useSearchShare } from './context/SongShareContext';
import { SharedSongLink } from './components/SharedSongLink';
import { CATALOG_MIN_YEAR, CATALOG_MAX_YEAR } from './services/catalogUrlState';
import { useCatalogSearchState } from './services/useCatalogSearchState';
import { compareAnimeSeason, copyAnimeSeasonMetadata, getAnimeSeason, matchesAnimeSeason } from './services/animeSeason';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { TitleLanguageProvider, useTitleLanguage } from './context/TitleLanguageContext';
import { PlaylistsProvider, usePlaylists } from './context/PlaylistsContext';
import { persistBackupImport, type BackupImport } from './services/dataBackup';
import { PlaylistSongPicker } from './components/collection/PlaylistSongPicker';
import { PlaylistDetail } from './components/collection/PlaylistDetail';
import { createSongReference, type PlaylistSongReference } from './services/playlistsStorage';
import { Header } from './components/Header';
import { FilterBar } from './components/FilterBar';
import { SongTable } from './components/SongTable';
import { AddSongModal } from './components/AddSongModal';
import { EditSongModal } from './components/EditSongModal';
import { DataModal } from './components/DataModal';
import { NoteModal } from './components/NoteModal';
import {
  AnimeSongEntry,
  AnimeSongItem,
  ActiveArtistFilter,
  DatabaseMode,
  NoteMap,
  NoteSongSnapshot,
  PersonalSongNote,
  SortKey,
  SortOrder,
} from './types';
import {
  ensureLocalSongIdentity,
  fetchEntries,
  reorderSavedSongs,
  createEntry,
  updateEntry,
  deleteEntry,
  resetEntriesToDefault,
} from './services/api';
import { loadStaticCatalog, searchStaticCatalog } from './services/catalogEngine';
import { copyAnimeTitleMetadata } from './services/animeTitles';
import { matchesSearchText } from './services/searchText';
import { hydrateArtistCredits, searchSongsByArtistIds } from './services/anisongdbArtists';
import {
  NOTES_STORAGE_KEY,
  clearAllNotes,
  clearNote,
  findNoteForSong,
  getSongMetadataFingerprint,
  getSongNoteKey,
  loadNotes,
  upsertNote,
} from './services/notesStorage';
import { PlayerProvider, usePlayer } from './context/PlayerContext';
import { MusicPlayer } from './components/player/MusicPlayer';
import { CollectionLibrary } from './components/collection/CollectionLibrary';
import { PlayCollectionBar } from './components/collection/CollectionPlayButtons';
import { SongTrack } from './types/player';
import { toSongTrack } from './utils/player';
import { CheckCircle2, AlertCircle } from 'lucide-react';

type NoteableSong = AnimeSongEntry | AnimeSongItem | NoteSongSnapshot;

const CATALOG_PAGE_SIZE = 100;

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
      const comparison = compareAnimeSeason(a, b, sortOrder === 'asc' ? 1 : -1);
      if (comparison) return comparison;
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
  const { closePlayer } = usePlayer();
  const shareSearch = useSearchShare();
  const { refresh: refreshPlaylists } = usePlaylists();
  const { searchTitles, displayTitle, resolveSeason } = useTitleLanguage();
  // Database Mode: 'anisongdb' (38,800+ tracks) vs 'collection' (local private library)
  const [mode, setMode] = useState<DatabaseMode>('anisongdb');
  const isCatalogMode = mode === 'anisongdb' || mode === 'animethemes';

  // Collection entries
  const [collectionEntries, setCollectionEntries] = useState<AnimeSongEntry[]>([]);
  const [isLoadingCollection, setIsLoadingCollection] = useState(true);

  // AniSongDB live catalog state
  const [anisongdbSongs, setAnisongdbSongs] = useState<AnimeSongItem[]>([]);
  const [isLoadingAniSongDb, setIsLoadingAniSongDb] = useState(false);
  const [aniSongDbTotal, setAniSongDbTotal] = useState(0);
  const [loadedCatalogKey, setLoadedCatalogKey] = useState('');
  const [catalogOffset, setCatalogOffset] = useState(0);

  // Fallback catalog lookup map for collection songs missing video_url
  const [catalogLookupMap, setCatalogLookupMap] = useState<Map<string, AnimeSongItem>>(new Map());

  useEffect(() => {
    if (mode !== 'collection' || catalogLookupMap.size > 0) return;
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
  }, [mode, catalogLookupMap.size]);

  const { state: searchState, update: updateSearch, typeQuery, reset: resetSearch } = useCatalogSearchState(mode, setMode);
  const { draft: searchQuery, q: debouncedSearch, yearMin: selectedMinYear, yearMax: selectedMaxYear,
    season: seasonFilter, theme: themeTypeFilter, sortKey, sortOrder, page: catalogPage } = searchState;
  const activeArtistFilter: ActiveArtistFilter | null = searchState.artistIds.length
    ? { ids: searchState.artistIds, label: searchState.artistLabel || `Artist ID ${searchState.artistIds.join(', ')}` } : null;
  const artistSelectionContext = useRef({ mode, searchState });
  artistSelectionContext.current = { mode, searchState };

  const [playlistSong, setPlaylistSong] = useState<PlaylistSongReference | null>(null);

  // Modals
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isDataOpen, setIsDataOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<AnimeSongEntry | null>(null);
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

  // Resolve Saved Songs using stable catalog identity first, with the existing
  // metadata fingerprint as a compatibility fallback for older saved entries.
  const findSavedEntry = useCallback((song: NoteableSong) => {
    const songKey = getSongNoteKey(song);
    const exactMatch = collectionEntries.find((entry) => getSongNoteKey(entry) === songKey);
    if (exactMatch) return exactMatch;

    const fingerprint = getSongMetadataFingerprint(song);
    return collectionEntries.find((entry) => getSongMetadataFingerprint(entry) === fingerprint);
  }, [collectionEntries]);

  const isSongSaved = useCallback(
    (song: NoteableSong) => Boolean(findSavedEntry(song)),
    [findSavedEntry],
  );

  // Keyboard shortcut listener (/ for search, N for new song)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Each modal owns its own keyboard behavior. Do not let global shortcuts
      // focus the page behind a dialog or stack another dialog on top.
      if (document.querySelector('dialog[open]') || isAddOpen || isDataOpen || editingEntry || activeNoteSong) {
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
  }, [isAddOpen, isDataOpen, editingEntry, activeNoteSong]);

  const handleSort = (key: SortKey) => updateSearch({
    sortKey: key,
    sortOrder: sortKey === key ? (sortOrder === 'asc' ? 'desc' : 'asc') : (key === 'anime_year' ? 'desc' : 'asc'),
  });
  const handleSearchChange = typeQuery;

  const handleArtistSelect = async (song: AnimeSongItem) => {
    const context = artistSelectionContext.current;
    let resolvedSong = song;
    if (!resolvedSong.artists?.length) {
      try {
        [resolvedSong] = await hydrateArtistCredits([song]);
      } catch (error) {
        console.error('Failed to resolve artist IDs for song', error);
      }
    }

    // A late artist lookup must not overwrite a newer search or history navigation.
    if (artistSelectionContext.current.mode !== context.mode
      || artistSelectionContext.current.searchState !== context.searchState) return;

    const ids = Array.from(
      new Set((resolvedSong.artists || []).map((artist) => artist.id).filter(Number.isInteger))
    );
    if (ids.length === 0) {
      showToast(`No canonical artist ID is available for "${song.artist}"`, 'info');
      return;
    }

    updateSearch({ q: '', draft: '', artistIds: ids, artistLabel: song.artist });
    showToast(`Filtering by the exact artist ID for "${song.artist}"`, 'info');
  };

  // Filter and Sort local collection entries
  const filteredAndSortedCollection = useMemo(() => {
    const q = debouncedSearch.trim();

    const filtered = collectionEntries.map(resolveSeason).filter((item) => {
      const personalNote = findNoteForSong(notes, item);
      const matchesSearch = matchesSearchText(
        [...searchTitles(item), item.artist, item.song_name, item.theme_type, personalNote?.text],
        q
      );

      const year = getAnimeSeason(item).year;
      const matchesYear =
        !year || (year >= selectedMinYear && year <= selectedMaxYear);

      return matchesSearch && matchesYear && matchesAnimeSeason(item, seasonFilter);
    });

    // The # column represents saved order, independent of stable song IDs.
    if (sortKey === 'id') return sortOrder === 'asc' ? filtered : filtered.reverse();
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    return filtered.sort((a, b) => {
      if (sortKey === 'anime_year') {
        return compareAnimeSeason(a, b, sortOrder === 'asc' ? 1 : -1) || collator.compare(a.anime_name, b.anime_name);
      }
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
  }, [resolveSeason, seasonFilter, searchTitles, collectionEntries, notes, debouncedSearch, selectedMinYear, selectedMaxYear, sortKey, sortOrder]);

  // Map collection items to SongTrack format for persistent Spotify-style audio/video playback
  const collectionTracks = useMemo<SongTrack[]>(() => {
    const tracks: SongTrack[] = [];
    for (const item of filteredAndSortedCollection) {
      let catalogMatch: AnimeSongItem | undefined;
      if (catalogLookupMap.size > 0) {
        const aKey = (item.anime_name || '').toLowerCase().trim();
        const sKey = `${aKey}:::${(item.song_name || '').toLowerCase().trim()}`;
        catalogMatch = catalogLookupMap.get(sKey) || catalogLookupMap.get(aKey);
      }

      const track = toSongTrack(item, 'collection', catalogMatch);
      if (track) tracks.push(track);
    }
    return tracks;
  }, [filteredAndSortedCollection, catalogLookupMap]);

  const collectionTracksMap = useMemo(() => {
    const map = new Map<string | number, SongTrack>();
    for (const track of collectionTracks) {
      map.set(String(track.id), track);
    }
    return map;
  }, [collectionTracks]);

  const handleAddToPlaylist = (song: NoteableSong) => {
    try {
      let identified = song;
      const isLocalCollectionEntry = mode === 'collection'
        && typeof song.id === 'number'
        && !('source' in song)
        && !('source_song_id' in song && song.source_song_id !== undefined);
      if (isLocalCollectionEntry) {
        identified = ensureLocalSongIdentity(song as AnimeSongEntry);
        setCollectionEntries((entries) => entries.map((entry) => entry.id === identified.id ? identified as AnimeSongEntry : entry));
      }
      setPlaylistSong(createSongReference(identified));
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not prepare this song for a playlist.', 'info');
    }
  };

  // Handlers for Add, Edit, Delete in collection
  const handleAddSong = async (newSong: Omit<AnimeSongEntry, 'id'>) => {
    const created = await createEntry(newSong);
    setCollectionEntries((prev) => [...prev, created]);
    showToast(`Added "${created.song_name || created.anime_name}" to Saved Songs`);
  };

  const handleSaveSong = async (song: NoteableSong) => {
    const explicitSource = 'source' in song ? song.source : undefined;
    const sourceSongId = 'source_song_id' in song && song.source_song_id !== undefined
      ? song.source_song_id
      : explicitSource === 'anisongdb' || explicitSource === 'animethemes' || isCatalogMode
        ? song.id
        : undefined;

    const newEntry = {
      ...copyAnimeTitleMetadata(song),
      ...copyAnimeSeasonMetadata(song),
      anime_name: song.anime_name,
      anime_year: Number(song.anime_year) || 2024,
      artist: song.artist || 'Unknown Artist',
      song_name: song.song_name || 'Unknown Title',
      theme_type: song.theme_type,
      video_url: song.video_url || undefined,
      audio_url: song.audio_url || undefined,
      ...(sourceSongId !== undefined ? { source_song_id: String(sourceSongId) } : {}),
    };
    const created = await createEntry(newEntry);
    setCollectionEntries((prev) => [...prev, created]);
    showToast(`Saved "${song.song_name || song.anime_name}" to Saved Songs!`);
  };

  const handleEditSave = async (id: number, updatedFields: Partial<AnimeSongEntry>) => {
    const updated = await updateEntry(id, updatedFields);
    setCollectionEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));
    showToast(`Updated "${displayTitle(updated)}"`);
  };

  const handleDelete = async (id: number) => {
    await deleteEntry(id);
    setCollectionEntries((prev) => prev.filter((e) => e.id !== id));
    showToast('Song removed from Saved Songs', 'info');
  };

  const handleToggleSaved = async (song: NoteableSong) => {
    const savedEntry = findSavedEntry(song);
    try {
      if (savedEntry) {
        await handleDelete(savedEntry.id);
      } else {
        await handleSaveSong(song);
      }
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not update Saved Songs.', 'info');
      throw cause;
    }
  };

  const handleImportData = async (imported: BackupImport) => {
    persistBackupImport(imported);
    closePlayer();
    setCollectionEntries(imported.entries);
    if (imported.notes !== undefined) setNotes(imported.notes);
    if (imported.playlists !== undefined) refreshPlaylists();
    setActiveNoteSong(null);
    showToast('Backup imported successfully');
  };

  const handleReset = async () => {
    const result = await resetEntriesToDefault();
    closePlayer();
    setCollectionEntries(result);
    updateSearch({ yearMin: CATALOG_MIN_YEAR, yearMax: CATALOG_MAX_YEAR });
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

  const handleResetFilters = resetSearch;

  const noteRecords = useMemo(
    () => (Object.values(notes) as PersonalSongNote[]).filter((note) => note.text.trim().length > 0),
    [notes]
  );

  // The Notes tab is completely local and uses the stored song snapshot, so notes
  // remain useful even if a song is later removed from My Collection.
  const filteredAndSortedNotes = useMemo(() => {
    const filtered = noteRecords.filter((note) => {
      const song = resolveSeason(note.song);
      const year = getAnimeSeason(song).year;
      const matchesYear = !year || (year >= selectedMinYear && year <= selectedMaxYear);
      const matchesQuery = matchesSearchText(
        [...searchTitles(song), song.artist, song.song_name, song.theme_type, note.text],
        debouncedSearch
      );
      return matchesYear && matchesQuery && matchesAnimeSeason(song, seasonFilter);
    });

    return sortSongItems(filtered.map((note) => resolveSeason(note.song)), sortKey, sortOrder);
  }, [resolveSeason, seasonFilter, searchTitles, noteRecords, debouncedSearch, selectedMinYear, selectedMaxYear, sortKey, sortOrder]);

  // Match note contents locally and merge them with the bundled catalog results.
  const catalogNoteMatches = useMemo(() => {
    if (!debouncedSearch.trim()) return [] as AnimeSongItem[];

    return noteRecords
      .filter((note) => note.songKey.startsWith('catalog:'))
      .filter((note) => {
        const song = resolveSeason(note.song);
        return matchesSearchText(
          [...searchTitles(song), song.artist, song.song_name, song.theme_type, note.text],
          debouncedSearch
        );
      })
      .map((note) => resolveSeason(note.song) as AnimeSongItem);
  }, [resolveSeason, searchTitles, noteRecords, debouncedSearch]);

  const artistFilterKey = activeArtistFilter?.ids.join(',') || '';
  const catalogQueryKey = JSON.stringify([mode, searchQuery, debouncedSearch, artistFilterKey,
    selectedMinYear, selectedMaxYear, themeTypeFilter, seasonFilter, sortKey, sortOrder]);
  const catalogRequestKey = JSON.stringify([catalogQueryKey, catalogPage]);

  useEffect(() => {
    if (!isCatalogMode) return;
    let current = true;
    setIsLoadingAniSongDb(true);
    // Do not fetch intermediate pages while the typed query is still debouncing.
    if (searchQuery !== debouncedSearch) return;
    async function fetchPage() {
      try {
        const params = {
          yearMin: selectedMinYear, yearMax: selectedMaxYear, themeType: themeTypeFilter, season: seasonFilter,
          sortKey, sortOrder, limit: CATALOG_PAGE_SIZE, offset: catalogPage * CATALOG_PAGE_SIZE,
        };
        const result = activeArtistFilter
          ? await searchSongsByArtistIds(activeArtistFilter.ids, params)
          : await searchStaticCatalog({ ...params, q: debouncedSearch }, catalogNoteMatches);
        if (!current) return;
        setAnisongdbSongs(result.data);
        setAniSongDbTotal(result.total);
        setCatalogOffset(result.offset);
        setLoadedCatalogKey(catalogRequestKey);
        setIsLoadingAniSongDb(false);
        if (result.offset !== params.offset) {
          updateSearch({ page: Math.floor(result.offset / CATALOG_PAGE_SIZE) }, 'replace');
        }
        if (!activeArtistFilter) {
          try {
            const hydrated = await hydrateArtistCredits(result.data);
            if (current) setAnisongdbSongs(hydrated);
          } catch (error) {
            console.warn('Could not load canonical artist IDs', error);
          }
        }
      } catch (error) {
        if (!current) return;
        setAnisongdbSongs([]);
        setAniSongDbTotal(0);
        setCatalogOffset(0);
        setLoadedCatalogKey(catalogRequestKey);
        setIsLoadingAniSongDb(false);
        setToast({ message: 'Could not load these catalog results. Try the search again.', type: 'info' });
      }
    }
    fetchPage();
    return () => { current = false; };
  }, [isCatalogMode, catalogRequestKey, catalogQueryKey, catalogPage, searchQuery, debouncedSearch,
    artistFilterKey, selectedMinYear, selectedMaxYear, themeTypeFilter, seasonFilter, sortKey, sortOrder, catalogNoteMatches]);

  const currentDisplayList = isCatalogMode
    ? anisongdbSongs
    : mode === 'collection'
      ? filteredAndSortedCollection
      : filteredAndSortedNotes;

  const totalFilteredCount = currentDisplayList.length;
  const totalItemsCount = isCatalogMode
    ? aniSongDbTotal
    : mode === 'collection'
      ? collectionEntries.length
      : noteRecords.length;

  const isLoading = isCatalogMode
    ? isLoadingAniSongDb || loadedCatalogKey !== catalogRequestKey
    : mode === 'collection'
      ? isLoadingCollection
      : false;

  const catalogPageCount = Math.max(1, Math.ceil(aniSongDbTotal / CATALOG_PAGE_SIZE));
  const catalogNavigation = isCatalogMode ? (
    <nav aria-label="Catalog result pages" className="my-4 flex flex-wrap items-center justify-between gap-2">
      <span role="status" className="text-xs text-neutral-400">
        {isLoading ? 'Loading results…' : aniSongDbTotal
          ? `Results ${catalogOffset + 1}–${catalogOffset + anisongdbSongs.length} of ${aniSongDbTotal.toLocaleString()} · Page ${Math.floor(catalogOffset / CATALOG_PAGE_SIZE) + 1} of ${catalogPageCount}`
          : 'No results'}
      </span>
      <div className="flex flex-wrap gap-1">
        {[
          { label: 'First', page: 0, disabled: catalogPage === 0 },
          { label: 'Previous', page: catalogPage - 1, disabled: catalogPage === 0 },
          { label: 'Next', page: catalogPage + 1, disabled: catalogPage + 1 >= catalogPageCount },
          { label: 'Last', page: catalogPageCount - 1, disabled: catalogPage + 1 >= catalogPageCount },
        ].map(({ label, page, disabled }) => (
          <button key={label} type="button" disabled={isLoading || disabled}
            onClick={() => {
              updateSearch({ page });
              document.getElementById('catalog-results-start')?.scrollIntoView({ block: 'start' });
            }}
            className="min-h-11 px-3 rounded-lg border border-neutral-700 text-sm hover:bg-neutral-700 cursor-pointer disabled:opacity-40 disabled:cursor-default focus-visible:outline-2 focus-visible:outline-emerald-400">
            {label}
          </button>
        ))}
      </div>
    </nav>
  ) : null;

  const songView = (
    <>
      {/* Filter Controls with Dual-Knob Year Range Slider up to 2026 */}
      <FilterBar
        seasonFilter={seasonFilter}
        onSeasonChange={(season) => updateSearch({ season })}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        minYear={CATALOG_MIN_YEAR}
        maxYear={CATALOG_MAX_YEAR}
        selectedMinYear={selectedMinYear}
        selectedMaxYear={selectedMaxYear}
        onYearRangeChange={(min, max) => {
          updateSearch({ yearMin: min, yearMax: max });
        }}
        totalFiltered={totalFilteredCount}
        totalItems={totalItemsCount}
        onResetFilters={handleResetFilters}
        themeTypeFilter={isCatalogMode ? themeTypeFilter : undefined}
        onThemeTypeChange={isCatalogMode ? (theme) => updateSearch({ theme }) : undefined}
        activeArtistFilter={isCatalogMode ? activeArtistFilter : null}
        onClearArtistFilter={isCatalogMode ? () => updateSearch({ artistIds: [], artistLabel: undefined }) : undefined}
        onShareSearch={isCatalogMode ? () => shareSearch(searchState) : undefined}
        placeholderText={
          isCatalogMode
            ? 'Search anime, artist, song title, or your notes... (Press / to focus)'
            : mode === 'collection'
              ? 'Search Saved Songs and personal notes... (Press / to focus)'
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

      <div id="catalog-results-start" className="scroll-mt-44 md:scroll-mt-24">{catalogNavigation}</div>
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
          rowOffset={isCatalogMode ? catalogOffset : 0}
          sortKey={sortKey}
          sortOrder={sortOrder}
          onSort={handleSort}
          onEdit={mode === 'collection' ? (item) => setEditingEntry(item) : undefined}
          searchQuery={debouncedSearch}
          isAniSongDbMode={isCatalogMode}
          isSongSaved={isSongSaved}
          onToggleSaved={handleToggleSaved}
          onAddToPlaylist={handleAddToPlaylist}
          onArtistSelect={isCatalogMode ? handleArtistSelect : undefined}
          notes={notes}
          onEditNote={(song) => setActiveNoteSong(song)}
          isNotesMode={mode === 'notes'}
          tracksMap={mode === 'collection' ? collectionTracksMap : undefined}
          allTracks={mode === 'collection' ? collectionTracks : undefined}
          onReorder={mode === 'collection' ? (songs) => {
            try {
              const entries = reorderSavedSongs(songs.map(song => Number(song.id)));
              setCollectionEntries(entries);
              updateSearch({ sortKey: 'id', sortOrder: 'asc' });
            } catch (cause) {
              showToast(cause instanceof Error ? cause.message : 'Could not save song order.', 'info');
              throw cause;
            }
          } : undefined}
        />
      )}
      {catalogNavigation}

    </>
  );

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
        <SharedSongLink />
        {mode === 'collection' ? (
          <CollectionLibrary
            savedCount={collectionEntries.length}
            renderPlaylist={(playlist) => (
              <PlaylistDetail
                key={playlist.id}
                playlist={playlist}
                notes={notes}
                onEditNote={setActiveNoteSong}
                onAddToPlaylist={handleAddToPlaylist}
                isSongSaved={isSongSaved}
                onToggleSaved={handleToggleSaved}
              />
            )}
          >
            {songView}
          </CollectionLibrary>
        ) : songView}

        {/* Footer Info */}
        <footer className="mt-8 pt-4 border-t border-neutral-800/80 flex flex-col sm:flex-row items-center justify-between text-xs text-neutral-500 gap-2">
          <div className="flex items-center gap-2">
            <span>Local Catalog &bull; 38,821 tracks (1924 – 2026)</span>
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

      {playlistSong && <PlaylistSongPicker song={playlistSong} onClose={() => setPlaylistSong(null)} />}

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
      <MusicPlayer
        isSongSaved={isSongSaved}
        onToggleSaved={handleToggleSaved}
        onAddToPlaylist={handleAddToPlaylist}
        onEditNote={setActiveNoteSong}
      />
    </div>
  );
}

export default function App() {
  return (
    <TitleLanguageProvider>
      <PlayerProvider>
        <PlaylistsProvider><SongShareProvider><MainApp /></SongShareProvider></PlaylistsProvider>
      </PlayerProvider>
    </TitleLanguageProvider>
  );
}
