import { useSongShare } from '../context/SongShareContext';
import { animeSeasonLabel } from '../services/animeSeason';
import { useTitleLanguage } from '../context/TitleLanguageContext';
import React from 'react';
import { createPortal } from 'react-dom';
import {
  Share2,
  ListPlus,
  GripVertical,
  ListEnd,
  NotebookPen,
  Heart,
  Ellipsis,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Edit2,
  Music2,
  Calendar,
  User,
  Disc,
  StickyNote,
  Search,
  type LucideIcon,
} from 'lucide-react';
import { AnimeSongEntry, AnimeSongItem, NoteMap, NoteSongSnapshot, SortKey, SortOrder } from '../types';
import { SongTrack } from '../types/player';
import { findNoteForSong, getSongNoteKey } from '../services/notesStorage';
import { getAniListAnimeUrl } from '../utils/anilist';
import { AnimeHoverCard } from './AnimeHoverCard';
import { usePlayer } from '../context/PlayerContext';
import { toSongTrack } from '../utils/player';
import { ThemeBadge } from './ThemeBadge';
import { findSearchMatchRanges } from '../services/searchText';
import { SortableSongRow, SortableSongRows } from './collection/SortableSongRows';

type SongRowItem = AnimeSongEntry | AnimeSongItem | NoteSongSnapshot;

export interface SongMenuAction {
  id: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void | Promise<void>;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}

interface OpenSongMenu {
  rowKey: string;
  item: SongRowItem;
  index: number;
  x: number;
  y: number;
  returnFocus: HTMLElement | null;
}

interface SongTableProps {
  entries: SongRowItem[];
  rowOffset?: number;
  sortKey: SortKey;
  sortOrder: SortOrder;
  onSort: (key: SortKey) => void;
  onEdit?: (entry: AnimeSongEntry) => void;
  searchQuery: string;
  isAniSongDbMode?: boolean;
  isAnimeThemesMode?: boolean;
  isSongSaved?: (song: SongRowItem) => boolean;
  onToggleSaved?: (song: SongRowItem) => void | Promise<void>;
  onArtistSelect?: (song: AnimeSongItem) => void | Promise<void>;
  notes: NoteMap;
  onEditNote: (song: SongRowItem) => void;
  isNotesMode?: boolean;
  tracksMap?: Map<string | number, SongTrack>;
  allTracks?: SongTrack[];
  onAddToPlaylist?: (song: SongRowItem) => void;
  onReorder?: (songs: SongRowItem[]) => void;
  playlistView?: {
    getTrack: (song: SongRowItem) => SongTrack | null;
    play: (song: SongRowItem) => void;
    rowKey: (index: number) => string;
    menuActions?: (index: number) => SongMenuAction[];
  };
}

const NOTE_SNIPPET_LENGTH = 110;

const getNoteSnippet = (text: string, query: string) => {
  const compactText = text.replace(/\s+/g, ' ').trim();
  if (compactText.length <= NOTE_SNIPPET_LENGTH) return compactText;

  const matchIndex = findSearchMatchRanges(compactText, query)[0]?.start ?? -1;

  let start = matchIndex >= 0 ? Math.max(0, matchIndex - 32) : 0;
  let end = Math.min(compactText.length, start + NOTE_SNIPPET_LENGTH);

  if (end === compactText.length) start = Math.max(0, end - NOTE_SNIPPET_LENGTH);

  const snippet = compactText.slice(start, end).trim();
  return `${start > 0 ? '…' : ''}${snippet}${end < compactText.length ? '…' : ''}`;
};

export const SongTable: React.FC<SongTableProps> = ({
  entries,
  rowOffset = 0,
  sortKey,
  sortOrder,
  onSort,
  onEdit,
  searchQuery,
  isAniSongDbMode,
  isAnimeThemesMode = false,
  isSongSaved,
  onToggleSaved,
  onArtistSelect,
  notes,
  onEditNote,
  isNotesMode = false,
  tracksMap,
  allTracks,
  onAddToPlaylist,
  playlistView,
  onReorder,
}) => {
  const { resolveSeason, displayTitle } = useTitleLanguage();
  const isCatalogMode = isAniSongDbMode !== undefined ? isAniSongDbMode : isAnimeThemesMode;
  const { currentTrack, queueSource, isPlaying, playTrack, togglePlay, addToQueue } = usePlayer();
  const [openMenu, setOpenMenu] = React.useState<OpenSongMenu | null>(null);
  const [pendingSaveKeys, setPendingSaveKeys] = React.useState<Set<string>>(() => new Set());
  const [menuAnnouncement, setMenuAnnouncement] = React.useState('');
  const menuRef = React.useRef<HTMLDivElement>(null);
  const rowKeys = entries.map((item, index) => playlistView?.rowKey(index) ?? `${getSongNoteKey(item)}:${String(item.id)}`);
  const reorderRows = onReorder ? (keys: string[]) => {
    setOpenMenu(null);
    const byKey = new Map(rowKeys.map((key, index) => [key, entries[index]]));
    try {
      onReorder(keys.map(key => byKey.get(key)!));
      setMenuAnnouncement('Song order updated.');
    } catch {
      setMenuAnnouncement('Song order could not be saved.');
    }
  } : undefined;

  // Safe highlight helper
  const highlightText = (text: string | number | undefined, query: string) => {
    if (text === undefined || text === null) return '';
    const str = String(text);
    if (!query.trim()) return str;

    const ranges = findSearchMatchRanges(str, query);
    if (ranges.length === 0) return str;

    const parts: React.ReactNode[] = [];
    let offset = 0;
    for (const range of ranges) {
      if (range.start > offset) parts.push(str.slice(offset, range.start));
      parts.push(
        <mark
          key={`${range.start}:${range.end}`}
          className="bg-emerald-500/30 text-emerald-300 font-semibold px-0.5 rounded"
        >
          {str.slice(range.start, range.end)}
        </mark>
      );
      offset = range.end;
    }
    if (offset < str.length) parts.push(str.slice(offset));
    return parts;
  };

  const renderSortIcon = (key: SortKey) => {
    if (playlistView) return null;
    if (sortKey !== key) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-neutral-600 opacity-60 group-hover:opacity-100" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-emerald-400" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-emerald-400" />
    );
  };

  const renderThemeBadge = (themeType?: string) => (
    <ThemeBadge themeType={themeType} />
  );

  const getPlayerTrack = (item: SongRowItem) => playlistView ? playlistView.getTrack(item) : tracksMap
      ? tracksMap.get(`collection:${item.id}`)
      : toSongTrack(item, isNotesMode ? 'notes' : 'catalog');

  const closeMenu = React.useCallback((restoreFocus = false) => {
    const returnFocus = openMenu?.returnFocus;
    setOpenMenu(null);
    if (restoreFocus && returnFocus?.isConnected) {
      window.setTimeout(() => returnFocus.focus(), 0);
    }
  }, [openMenu]);

  React.useEffect(() => {
    if (!openMenu) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (menuRef.current?.contains(target) || target.closest('[data-song-actions-trigger]')) return;
      closeMenu(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu(true);
      }
    };
    const closeOnViewportChange = () => closeMenu(false);

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', closeOnViewportChange);
    window.addEventListener('scroll', closeOnViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', closeOnViewportChange);
      window.removeEventListener('scroll', closeOnViewportChange, true);
    };
  }, [openMenu, closeMenu]);

  React.useEffect(() => {
    if (!openMenu) return;
    const frame = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)')?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [openMenu?.rowKey, openMenu?.x, openMenu?.y]);

  React.useLayoutEffect(() => {
    if (!openMenu || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const margin = 8;
    let x = openMenu.x;
    let y = openMenu.y;

    if (rect.right > window.innerWidth - margin) x -= rect.right - (window.innerWidth - margin);
    if (rect.left < margin) x += margin - rect.left;
    if (rect.bottom > window.innerHeight - margin) y -= rect.bottom - (window.innerHeight - margin);
    if (rect.top < margin) y += margin - rect.top;

    if (x !== openMenu.x || y !== openMenu.y) {
      setOpenMenu((current) => current ? { ...current, x, y } : current);
    }
  }, [openMenu]);

  const openAnchoredMenu = (
    event: React.MouseEvent<HTMLButtonElement>,
    item: SongRowItem,
    index: number,
    rowKey: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (openMenu?.rowKey === rowKey) {
      closeMenu(false);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    setOpenMenu({
      rowKey,
      item,
      index,
      x: Math.max(8, rect.right - 208),
      y: rect.bottom + 6,
      returnFocus: event.currentTarget,
    });
  };

  const openContextMenu = (
    event: React.MouseEvent<HTMLElement>,
    item: SongRowItem,
    index: number,
    rowKey: string,
  ) => {
    if ((event.target as HTMLElement).closest('a, button, input, textarea, select, [role="button"]')) return;
    event.preventDefault();
    setOpenMenu({
      rowKey,
      item,
      index,
      x: event.clientX,
      y: event.clientY,
      returnFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
    });
  };

  const shareSong = useSongShare();

  const getMenuActions = (item: SongRowItem, index: number) => {
    const track = getPlayerTrack(item);
    const songName = item.song_name || displayTitle(item);
    const primary: SongMenuAction[] = [
      { id: 'share', label: 'Share song', icon: Share2, onSelect: () => shareSong(item) },
      {
        id: 'playlist',
        label: 'Add to playlist',
        icon: ListPlus,
        disabled: !onAddToPlaylist,
        onSelect: () => onAddToPlaylist?.(item),
      },
      {
        id: 'queue',
        label: 'Add to queue',
        icon: ListEnd,
        disabled: !track,
        onSelect: () => {
          if (!track) return;
          addToQueue(track);
          setMenuAnnouncement(`${songName} added to queue.`);
        },
      },
      {
        id: 'note',
        label: 'Add personal note',
        icon: NotebookPen,
        onSelect: () => onEditNote(item),
      },
    ];

    const secondary: SongMenuAction[] = [];
    if (onEdit) {
      secondary.push({
        id: 'edit',
        label: 'Edit song',
        icon: Edit2,
        onSelect: () => onEdit(item as AnimeSongEntry),
      });
    }
    secondary.push(...(playlistView?.menuActions?.(index) ?? []));
    return { primary, secondary };
  };

  const runMenuAction = (action: SongMenuAction) => {
    if (action.disabled) return;
    const returnFocus = openMenu?.returnFocus;
    setOpenMenu(null);
    if (returnFocus?.isConnected) returnFocus.focus();
    Promise.resolve(action.onSelect()).catch((error) => {
      console.error(`Song action "${action.label}" failed`, error);
    });
  };

  const handleToggleSaved = async (item: SongRowItem) => {
    if (!onToggleSaved) return;
    const saveKey = getSongNoteKey(item);
    if (pendingSaveKeys.has(saveKey)) return;

    setPendingSaveKeys((current) => new Set(current).add(saveKey));
    try {
      await onToggleSaved(item);
    } finally {
      setPendingSaveKeys((current) => {
        const next = new Set(current);
        next.delete(saveKey);
        return next;
      });
    }
  };

  const renderRowActions = (item: SongRowItem, index: number, rowKey: string) => {
    const isSaved = Boolean(isSongSaved?.(item));
    const isPending = pendingSaveKeys.has(getSongNoteKey(item));
    const menuOpen = openMenu?.rowKey === rowKey;

    return (
      <div className="flex shrink-0 items-center justify-end gap-1">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void handleToggleSaved(item).catch(() => {});
          }}
          disabled={!onToggleSaved || isPending}
          aria-label={isSaved ? 'Remove from saved songs' : 'Save song'}
          title={isSaved ? 'Remove from saved songs' : 'Save song'}
          className={`inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md bg-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-300 disabled:cursor-default disabled:opacity-50 ${
            isSaved
              ? 'text-emerald-400 hover:bg-emerald-950/50 hover:text-emerald-300'
              : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100'
          }`}
        >
          <Heart aria-hidden="true" className={`h-4 w-4 ${isSaved ? 'fill-current' : ''}`} />
        </button>
        <button
          type="button"
          data-song-actions-trigger
          onClick={(event) => openAnchoredMenu(event, item, index, rowKey)}
          aria-label="More song actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title="More song actions"
          className={`inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md bg-transparent text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-300 ${
            menuOpen ? 'bg-neutral-800 text-neutral-100' : ''
          }`}
        >
          <Ellipsis aria-hidden="true" className="h-[18px] w-[18px]" />
        </button>
      </div>
    );
  };

  const renderOpenMenu = () => {
    if (!openMenu || typeof document === 'undefined') return null;
    const { primary, secondary } = getMenuActions(openMenu.item, openMenu.index);

    const renderAction = (action: SongMenuAction) => {
      const Icon = action.icon;
      return (
        <button
          key={action.id}
          type="button"
          role="menuitem"
          disabled={action.disabled}
          onClick={(event) => {
            event.stopPropagation();
            runMenuAction(action);
          }}
          className={`flex min-h-9 w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-emerald-300 disabled:cursor-default disabled:opacity-40 ${
            action.tone === 'danger'
              ? 'text-rose-300 hover:bg-rose-950/50'
              : 'text-neutral-200 hover:bg-neutral-800 hover:text-white'
          }`}
        >
          <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-current" />
          <span>{action.label}</span>
        </button>
      );
    };

    return createPortal(
      <div
        ref={menuRef}
        role="menu"
        aria-label="Song actions"
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          const items = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)')
          );
          if (!items.length) return;
          const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
          let nextIndex = currentIndex;

          if (event.key === 'ArrowDown') nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
          else if (event.key === 'ArrowUp') nextIndex = currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length;
          else if (event.key === 'Home') nextIndex = 0;
          else if (event.key === 'End') nextIndex = items.length - 1;
          else return;

          event.preventDefault();
          items[nextIndex]?.focus();
        }}
        className="fixed z-[90] w-52 rounded-lg border border-neutral-700/80 bg-[#1e2022] p-1.5 text-neutral-100 shadow-xl"
        style={{ left: openMenu.x, top: openMenu.y }}
      >
        <div className="space-y-0.5">{primary.map(renderAction)}</div>
        {secondary.length > 0 && (
          <>
            <div className="my-1 border-t border-neutral-800" />
            <div className="space-y-0.5">{secondary.map(renderAction)}</div>
          </>
        )}
      </div>,
      document.body,
    );
  };

  const renderSongName = (item: SongRowItem) => {
    const playerTrack = getPlayerTrack(item);
    const songName = item.song_name || (playerTrack ? displayTitle(item) : 'No song name');

    if (!playerTrack) {
      return <span className="text-emerald-400 font-medium">{highlightText(songName, searchQuery)}</span>;
    }

    return (
      <button
        type="button"
        onClick={() => {
          if (playlistView) { playlistView.play(item); return; }
          if (queueSource !== 'manual' && currentTrack && String(currentTrack.id) === String(playerTrack.id)) {
            if (!isPlaying) togglePlay();
          } else {
            playTrack(playerTrack, allTracks);
          }
        }}
        className="text-left text-emerald-400 hover:text-emerald-300 font-medium hover:underline cursor-pointer transition-colors"
        title="Play in bottom player"
      >
        {highlightText(songName, searchQuery)}
      </button>
    );
  };

  if (entries.length === 0) {
    return (
      <div className="bg-[#232628] border border-neutral-800 rounded-xl p-12 text-center shadow-sm">
        <div className="w-12 h-12 mx-auto rounded-full bg-neutral-800 flex items-center justify-center text-neutral-500 mb-3">
          <Music2 className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-neutral-200">
          {isNotesMode ? 'No personal notes found' : 'No anime songs found'}
        </h3>
        <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto">
          {searchQuery
            ? isNotesMode
              ? `No personal notes matching "${searchQuery}" in this year range.`
              : isCatalogMode
                ? `No tracks matching "${searchQuery}" in these year/type filters.`
                : `No saved songs matching "${searchQuery}" in this year range.`
            : isNotesMode
            ? 'No personal notes match these filters. Add one from Catalog or My Collection.'
            : isCatalogMode
            ? 'No tracks found in the catalog. Try broadening your year range, season, or theme filter.'
            : 'Saved Songs is currently empty. Switch to the catalog or add songs to get started.'}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#232628] border border-neutral-800 rounded-xl shadow-sm overflow-visible">
      {/* Desktop & Tablet Table View */}
      <div className="hidden md:block overflow-x-auto overflow-y-visible">
        <table className="w-full text-left border-collapse">
          <thead className={playlistView ? "[&_th]:cursor-default" : undefined}>
            <tr className="border-b border-neutral-800 bg-neutral-900/60 text-xs font-semibold text-neutral-400 select-none">
              <th
                onClick={() => !playlistView && onSort('id')}
                className="py-3 px-4 w-14 cursor-pointer hover:text-neutral-200 transition-colors group"
              >
                <div className="flex items-center gap-1">
                  <span>#</span>
                  {renderSortIcon('id')}
                </div>
              </th>

              <th
                onClick={() => !playlistView && onSort('anime_name')}
                className="py-3 px-4 cursor-pointer hover:text-neutral-200 transition-colors group"
              >
                <div className="flex items-center gap-1.5">
                  <Disc className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Anime Name</span>
                  {renderSortIcon('anime_name')}
                </div>
              </th>

              <th
                onClick={() => !playlistView && onSort('theme_type')}
                className="py-3 px-4 w-32 cursor-pointer hover:text-neutral-200 transition-colors group"
              >
                <div className="flex items-center gap-1.5">
                  <Music2 className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Theme</span>
                  {renderSortIcon('theme_type')}
                </div>
              </th>

              <th
                onClick={() => !playlistView && onSort('anime_year')}
                className="py-3 px-4 w-28 cursor-pointer hover:text-neutral-200 transition-colors group"
              >
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Season / Year</span>
                  {renderSortIcon('anime_year')}
                </div>
              </th>

              <th
                onClick={() => !playlistView && onSort('artist')}
                className="py-3 px-4 cursor-pointer hover:text-neutral-200 transition-colors group"
              >
                <div className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Artist</span>
                  {renderSortIcon('artist')}
                </div>
              </th>

              <th
                onClick={() => !playlistView && onSort('song_name')}
                className="py-3 px-4 cursor-pointer hover:text-neutral-200 transition-colors group"
              >
                <div className="flex items-center gap-1.5">
                  <Music2 className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Song Name</span>
                  {renderSortIcon('song_name')}
                </div>
              </th>

              <th className="py-3 px-4 w-28 text-right">Actions</th>
            </tr>
          </thead>
          <SortableSongRows as="tbody" values={rowKeys} onReorder={reorderRows} className="divide-y divide-neutral-800/80 text-sm">
            {entries.map((item, index) => {
              const note = findNoteForSong(notes, item);
              const hasNote = Boolean(note?.text.trim());
              const rowKey = playlistView?.rowKey(index) ?? `${getSongNoteKey(item)}:${String(item.id)}`;

              return (
                <SortableSongRow as="tr" rowKey={rowKey}
                  key={rowKey}
                  onContextMenu={(event) => openContextMenu(event, item, index, rowKey)}
                  className="hover:bg-neutral-800/40 transition-colors group"
                >
                  <td className="py-3 px-4 text-xs font-mono text-neutral-500">
                    <span data-song-drag-handle={onReorder ? '' : undefined} style={onReorder ? { touchAction: 'none' } : undefined} title={onReorder ? 'Drag to reorder' : undefined} className="inline-flex items-center gap-1.5">
                      {onReorder && <GripVertical aria-hidden="true" className="h-4 w-4 shrink-0" />}
                      <span data-song-number>{rowOffset + index + 1}</span>
                    </span>
                  </td>

                  {/* Anime Name with Hover Poster Card & Direct AniList Link */}
                  <td className="py-3 px-4 font-medium text-neutral-100">
                    <AnimeHoverCard
                      animeName={item.anime_name}
                      displayName={displayTitle(item)}
                      anilistId={(item as any).anilist_id}
                    >
                      <a
                        href={getAniListAnimeUrl(item.anime_name, (item as AnimeSongItem).anilist_id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-neutral-100 hover:text-emerald-300 underline decoration-dotted decoration-neutral-600 hover:decoration-emerald-400 transition-colors cursor-pointer"
                        title="View on AniList"
                      >
                        {highlightText(displayTitle(item), searchQuery)}
                      </a>
                    </AnimeHoverCard>
                  </td>

                  {/* Theme Type (Distinct static column) */}
                  <td className="py-3 px-4 text-xs whitespace-nowrap">
                    {item.theme_type ? (
                      renderThemeBadge(item.theme_type)
                    ) : (
                      <span className="text-neutral-600 text-xs">—</span>
                    )}
                  </td>

                  {/* Year (Distinct static column) */}
                  <td className="py-3 px-4 text-neutral-300 font-mono text-xs whitespace-nowrap">
                    <span title="Anime catalog season" className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-300">
                      {highlightText(animeSeasonLabel(resolveSeason(item)), searchQuery)}
                    </span>
                  </td>

                  {/* Artist */}
                  <td className="py-3 px-4 text-neutral-300">
                    {item.artist ? (
                      isCatalogMode && onArtistSelect ? (
                        <button
                          type="button"
                          onClick={() => onArtistSelect(item as AnimeSongItem)}
                          className="group/artist inline-flex cursor-pointer items-center gap-1.5 text-left text-neutral-300 underline decoration-dotted decoration-neutral-600 transition-colors hover:text-emerald-300 hover:decoration-emerald-400"
                          title={`Find every song connected to ${item.artist} using the artist ID`}
                          aria-label={`Search all songs by ${item.artist}`}
                        >
                          <Search className="h-3 w-3 flex-shrink-0 text-neutral-500 transition-colors group-hover/artist:text-emerald-400" />
                          <span>{highlightText(item.artist, searchQuery)}</span>
                        </button>
                      ) : (
                        highlightText(item.artist, searchQuery)
                      )
                    ) : (
                      <span className="text-neutral-600 italic">Unknown</span>
                    )}
                  </td>

                  {/* Song titles use the persistent player for collection tracks. */}
                  <td className="py-3 px-4 text-neutral-200">
                    {renderSongName(item)}
                    {hasNote && note && (
                      <div className="mt-1 flex items-start gap-1.5 max-w-md text-[11px] leading-4 text-amber-200/80">
                        <StickyNote className="w-3 h-3 mt-0.5 flex-shrink-0 text-amber-300 fill-amber-300/20" />
                        <span className="min-w-0 truncate" title={note.text}>
                          {highlightText(getNoteSnippet(note.text, searchQuery), searchQuery)}
                        </span>
                      </div>
                    )}
                  </td>

                  {/* Actions column */}
                  <td className="py-3 px-4 text-right">
                    {renderRowActions(item, index, rowKey)}
                  </td>
                </SortableSongRow>
              );
            })}
          </SortableSongRows>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden">
        {/* Mobile Sort Controls */}
        {!playlistView && <div className="p-3 bg-neutral-900/80 border-b border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
          <div className="flex items-center gap-1.5">
            <span>Sort by:</span>
            <select
              value={sortKey}
              onChange={(e) => onSort(e.target.value as SortKey)}
              className="bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-emerald-500"
            >
              <option value="anime_name">Anime Name</option>
              <option value="anime_year">Season / Year</option>
              <option value="artist">Artist</option>
              <option value="song_name">Song Title</option>
              <option value="id">Index (#)</option>
            </select>
          </div>
          <button
            onClick={() => !playlistView && onSort(sortKey)}
            className="flex items-center gap-1 px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 text-xs transition-colors cursor-pointer"
          >
            <span>{sortOrder === 'asc' ? 'Ascending' : 'Descending'}</span>
            {sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-400" /> : <ArrowDown className="w-3 h-3 text-emerald-400" />}
          </button>
        </div>}

        <SortableSongRows as="div" values={rowKeys} onReorder={reorderRows} className="divide-y divide-neutral-800">
          {entries.map((item, index) => {
          const note = findNoteForSong(notes, item);
          const hasNote = Boolean(note?.text.trim());
          const rowKey = playlistView?.rowKey(index) ?? `${getSongNoteKey(item)}:${String(item.id)}`;

          return (
            <SortableSongRow as="div" rowKey={rowKey}
              key={rowKey}
              onContextMenu={(event) => openContextMenu(event, item, index, rowKey)}
              className="p-4 space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <span data-song-drag-handle={onReorder ? '' : undefined} style={onReorder ? { touchAction: 'none' } : undefined} title={onReorder ? 'Drag to reorder' : undefined} className="text-[11px] font-mono text-neutral-500 mr-2">
                    {onReorder && <GripVertical aria-hidden="true" className="mr-1 inline h-4 w-4" />}
                    #<span data-song-number>{rowOffset + index + 1}</span>
                  </span>
                  <AnimeHoverCard
                    animeName={item.anime_name}
                    displayName={displayTitle(item)}
                    anilistId={(item as any).anilist_id}
                  >
                    <a
                      href={getAniListAnimeUrl(item.anime_name, (item as AnimeSongItem).anilist_id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="font-semibold text-neutral-100 text-sm hover:text-emerald-400 underline decoration-dotted cursor-pointer"
                      title="View on AniList"
                    >
                      {highlightText(displayTitle(item), searchQuery)}
                    </a>
                  </AnimeHoverCard>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {renderThemeBadge(item.theme_type)}
                  <span title="Anime catalog season" className="text-xs px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-400 font-mono">
                    {animeSeasonLabel(resolveSeason(item))}
                  </span>
                </div>
              </div>

              <div className="text-xs text-emerald-400 font-medium flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Music2 className="w-3 h-3 flex-shrink-0 text-emerald-500/80" />
                  {renderSongName(item)}
                </div>
              </div>

              {hasNote && note && (
                <div className="flex items-start gap-1.5 rounded-lg border border-amber-900/40 bg-amber-950/20 px-2.5 py-2 text-[11px] leading-4 text-amber-100/80">
                  <StickyNote className="w-3 h-3 mt-0.5 flex-shrink-0 text-amber-300 fill-amber-300/20" />
                  <span className="min-w-0 line-clamp-2" title={note.text}>
                    {highlightText(getNoteSnippet(note.text, searchQuery), searchQuery)}
                  </span>
                </div>
              )}

              <div className="text-xs text-neutral-400 flex items-center justify-between pt-1">
                <div className="flex min-w-0 flex-1 items-center gap-1.5 mr-2">
                  <User className="w-3 h-3 text-neutral-500" />
                  {item.artist && isCatalogMode && onArtistSelect ? (
                    <button
                      type="button"
                      onClick={() => onArtistSelect(item as AnimeSongItem)}
                      className="cursor-pointer truncate text-left underline decoration-dotted decoration-neutral-600 transition-colors hover:text-emerald-300"
                      title={`Find every song connected to ${item.artist} using the artist ID`}
                      aria-label={`Search all songs by ${item.artist}`}
                    >
                      {highlightText(item.artist, searchQuery)}
                    </button>
                  ) : (
                    <span className="truncate">{highlightText(item.artist || 'Unknown Artist', searchQuery)}</span>
                  )}
                </div>

                {renderRowActions(item, index, rowKey)}
              </div>
            </SortableSongRow>
          );
        })}
        </SortableSongRows>
      </div>
      {renderOpenMenu()}
      <span role="status" aria-live="polite" className="sr-only">{menuAnnouncement}</span>
    </div>
  );
};
