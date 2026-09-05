import React from 'react';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Edit2,
  Trash2,
  Music2,
  Calendar,
  User,
  Disc,
  BookmarkPlus,
  Check,
  StickyNote,
  Search,
} from 'lucide-react';
import { AnimeSongEntry, AnimeSongItem, NoteMap, SortKey, SortOrder } from '../types';
import { SongTrack } from '../types/player';
import { findNoteForSong, getSongNoteKey } from '../services/notesStorage';
import { getAniListAnimeUrl } from '../utils/anilist';
import { AnimeHoverCard } from './AnimeHoverCard';
import { usePlayer } from '../context/PlayerContext';
import { toSongTrack } from '../utils/player';
import { ThemeBadge } from './ThemeBadge';

interface SongTableProps {
  entries: (AnimeSongEntry | AnimeSongItem)[];
  sortKey: SortKey;
  sortOrder: SortOrder;
  onSort: (key: SortKey) => void;
  onEdit?: (entry: AnimeSongEntry) => void;
  onDelete?: (id: number) => void;
  searchQuery: string;
  isAniSongDbMode?: boolean;
  isAnimeThemesMode?: boolean;
  onSaveToCollection?: (song: AnimeSongItem) => void;
  savedSongKeys?: Set<string>;
  onArtistSelect?: (song: AnimeSongItem) => void | Promise<void>;
  notes: NoteMap;
  onEditNote: (song: AnimeSongEntry | AnimeSongItem) => void;
  isNotesMode?: boolean;
  tracksMap?: Map<string | number, SongTrack>;
  allTracks?: SongTrack[];
}

const NOTE_SNIPPET_LENGTH = 110;

const getNoteSnippet = (text: string, query: string) => {
  const compactText = text.replace(/\s+/g, ' ').trim();
  if (compactText.length <= NOTE_SNIPPET_LENGTH) return compactText;

  const normalizedQuery = query.trim().toLocaleLowerCase();
  let matchIndex = normalizedQuery
    ? compactText.toLocaleLowerCase().indexOf(normalizedQuery)
    : -1;

  if (matchIndex < 0 && normalizedQuery) {
    const termIndexes = normalizedQuery
      .split(/\s+/)
      .map((term) => compactText.toLocaleLowerCase().indexOf(term))
      .filter((index) => index >= 0);
    matchIndex = termIndexes.length > 0 ? Math.min(...termIndexes) : -1;
  }

  let start = matchIndex >= 0 ? Math.max(0, matchIndex - 32) : 0;
  let end = Math.min(compactText.length, start + NOTE_SNIPPET_LENGTH);

  if (end === compactText.length) start = Math.max(0, end - NOTE_SNIPPET_LENGTH);

  const snippet = compactText.slice(start, end).trim();
  return `${start > 0 ? '…' : ''}${snippet}${end < compactText.length ? '…' : ''}`;
};

export const SongTable: React.FC<SongTableProps> = ({
  entries,
  sortKey,
  sortOrder,
  onSort,
  onEdit,
  onDelete,
  searchQuery,
  isAniSongDbMode,
  isAnimeThemesMode = false,
  onSaveToCollection,
  savedSongKeys = new Set(),
  onArtistSelect,
  notes,
  onEditNote,
  isNotesMode = false,
  tracksMap,
  allTracks,
}) => {
  const isCatalogMode = isAniSongDbMode !== undefined ? isAniSongDbMode : isAnimeThemesMode;
  const { currentTrack, isPlaying, playTrack, togglePlay } = usePlayer();

  // Safe highlight helper
  const highlightText = (text: string | number | undefined, query: string) => {
    if (text === undefined || text === null) return '';
    const str = String(text);
    if (!query.trim()) return str;

    const escapedTerms = query
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
      .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${escapedTerms.join('|')})`, 'gi');
    const exactMatch = new RegExp(`^(?:${escapedTerms.join('|')})$`, 'i');
    const parts = str.split(regex);

    return parts.map((part, i) =>
      exactMatch.test(part) ? (
        <mark
          key={i}
          className="bg-emerald-500/30 text-emerald-300 font-semibold px-0.5 rounded"
        >
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const renderSortIcon = (key: SortKey) => {
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

  const renderSongName = (item: AnimeSongEntry | AnimeSongItem) => {
    const playerTrack = tracksMap
      ? tracksMap.get(`collection:${item.id}`)
      : toSongTrack(item, isNotesMode ? 'notes' : 'catalog');
    const songName = item.song_name || (playerTrack ? item.anime_name : 'No song name');

    if (!playerTrack) {
      return <span className="text-emerald-400 font-medium">{highlightText(songName, searchQuery)}</span>;
    }

    return (
      <button
        type="button"
        onClick={() => {
          if (currentTrack && String(currentTrack.id) === String(playerTrack.id)) {
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
                : `No collection songs matching "${searchQuery}" in this year range.`
            : isNotesMode
            ? 'No personal notes match these filters. Add one from Catalog or My Collection.'
            : isCatalogMode
            ? 'No tracks found in the catalog. Try broadening your year range or theme filter.'
            : 'Your collection is currently empty. Switch to the catalog or add songs to get started.'}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#232628] border border-neutral-800 rounded-xl shadow-sm overflow-visible">
      {/* Desktop & Tablet Table View */}
      <div className="hidden md:block overflow-x-auto overflow-y-visible">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-neutral-800 bg-neutral-900/60 text-xs font-semibold text-neutral-400 select-none">
              <th
                onClick={() => onSort('id')}
                className="py-3 px-4 w-14 cursor-pointer hover:text-neutral-200 transition-colors group"
              >
                <div className="flex items-center gap-1">
                  <span>#</span>
                  {renderSortIcon('id')}
                </div>
              </th>

              <th
                onClick={() => onSort('anime_name')}
                className="py-3 px-4 cursor-pointer hover:text-neutral-200 transition-colors group"
              >
                <div className="flex items-center gap-1.5">
                  <Disc className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Anime Name</span>
                  {renderSortIcon('anime_name')}
                </div>
              </th>

              <th
                onClick={() => onSort('theme_type')}
                className="py-3 px-4 w-32 cursor-pointer hover:text-neutral-200 transition-colors group"
              >
                <div className="flex items-center gap-1.5">
                  <Music2 className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Theme</span>
                  {renderSortIcon('theme_type')}
                </div>
              </th>

              <th
                onClick={() => onSort('anime_year')}
                className="py-3 px-4 w-28 cursor-pointer hover:text-neutral-200 transition-colors group"
              >
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Year</span>
                  {renderSortIcon('anime_year')}
                </div>
              </th>

              <th
                onClick={() => onSort('artist')}
                className="py-3 px-4 cursor-pointer hover:text-neutral-200 transition-colors group"
              >
                <div className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Artist</span>
                  {renderSortIcon('artist')}
                </div>
              </th>

              <th
                onClick={() => onSort('song_name')}
                className="py-3 px-4 cursor-pointer hover:text-neutral-200 transition-colors group"
              >
                <div className="flex items-center gap-1.5">
                  <Music2 className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Song Name</span>
                  {renderSortIcon('song_name')}
                </div>
              </th>

              <th className="py-3 px-4 w-36 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/80 text-sm">
            {entries.map((item, index) => {
              const songKey = `${(item.anime_name || '').toLowerCase()}:::${(item.song_name || '').toLowerCase()}`;
              const isSaved = savedSongKeys.has(songKey);
              const note = findNoteForSong(notes, item);
              const hasNote = Boolean(note?.text.trim());
              const rowKey = `${getSongNoteKey(item)}:${String(item.id)}`;

              return (
                <tr
                  key={rowKey}
                  className="hover:bg-neutral-800/40 transition-colors group"
                >
                  <td className="py-3 px-4 text-xs font-mono text-neutral-500">
                    {typeof item.id === 'number' ? item.id : index + 1}
                  </td>

                  {/* Anime Name with Hover Poster Card & Direct AniList Link */}
                  <td className="py-3 px-4 font-medium text-neutral-100">
                    <AnimeHoverCard
                      animeName={item.anime_name}
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
                        {highlightText(item.anime_name, searchQuery)}
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
                    {item.anime_year ? (
                      <span className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-300">
                        {highlightText(item.anime_year, searchQuery)}
                      </span>
                    ) : (
                      <span className="text-neutral-600">—</span>
                    )}
                  </td>

                  {/* Artist */}
                  <td className="py-3 px-4 text-neutral-300">
                    {item.artist ? (
                      isCatalogMode && onArtistSelect ? (
                        <button
                          type="button"
                          onClick={() => onArtistSelect(item as AnimeSongItem)}
                          className="group/artist inline-flex items-center gap-1.5 text-left text-neutral-300 underline decoration-dotted decoration-neutral-600 transition-colors hover:text-emerald-300 hover:decoration-emerald-400"
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
                    <div className="flex items-center justify-end gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => onEditNote(item)}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                          hasNote
                            ? 'text-amber-300 bg-amber-950/40 hover:bg-amber-950/70'
                            : 'text-neutral-400 hover:text-amber-300 hover:bg-neutral-800'
                        }`}
                        title={hasNote ? 'Edit personal note' : 'Add personal note'}
                        aria-label={`${hasNote ? 'Edit' : 'Add'} personal note for ${item.song_name || item.anime_name}`}
                      >
                        <StickyNote className={`w-3.5 h-3.5 ${hasNote ? 'fill-amber-300/20' : ''}`} />
                      </button>
                      {isCatalogMode ? (
                        /* Save to Collection button */
                        <button
                          onClick={() => onSaveToCollection && onSaveToCollection(item as AnimeSongItem)}
                          disabled={isSaved}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                            isSaved
                              ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 cursor-default'
                              : 'bg-neutral-800 hover:bg-emerald-600 text-neutral-200 hover:text-white border border-neutral-700 cursor-pointer shadow-sm'
                          }`}
                        >
                          {isSaved ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span>Saved</span>
                            </>
                          ) : (
                            <>
                              <BookmarkPlus className="w-3 h-3" />
                              <span>+ Save</span>
                            </>
                          )}
                        </button>
                      ) : (
                        /* Collection edit / delete */
                        <>
                          {onEdit && (
                            <button
                              onClick={() => onEdit(item as AnimeSongEntry)}
                              className="p-1.5 rounded-lg text-neutral-400 hover:text-emerald-400 hover:bg-neutral-800 transition-colors cursor-pointer"
                              title="Edit song"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {onDelete && typeof item.id === 'number' && (
                            <button
                              onClick={() => onDelete(item.id as number)}
                              className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-400 hover:bg-neutral-800 transition-colors cursor-pointer"
                              title="Remove from My Collection"
                              aria-label={`Remove ${item.song_name || item.anime_name} from My Collection`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden">
        {/* Mobile Sort Controls */}
        <div className="p-3 bg-neutral-900/80 border-b border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
          <div className="flex items-center gap-1.5">
            <span>Sort by:</span>
            <select
              value={sortKey}
              onChange={(e) => onSort(e.target.value as SortKey)}
              className="bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-emerald-500"
            >
              <option value="anime_name">Anime Name</option>
              <option value="anime_year">Year</option>
              <option value="artist">Artist</option>
              <option value="song_name">Song Title</option>
              <option value="id">Index (#)</option>
            </select>
          </div>
          <button
            onClick={() => onSort(sortKey)}
            className="flex items-center gap-1 px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 text-xs transition-colors cursor-pointer"
          >
            <span>{sortOrder === 'asc' ? 'Ascending' : 'Descending'}</span>
            {sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-400" /> : <ArrowDown className="w-3 h-3 text-emerald-400" />}
          </button>
        </div>

        <div className="divide-y divide-neutral-800">
          {entries.map((item, index) => {
          const songKey = `${(item.anime_name || '').toLowerCase()}:::${(item.song_name || '').toLowerCase()}`;
          const isSaved = savedSongKeys.has(songKey);
          const note = findNoteForSong(notes, item);
          const hasNote = Boolean(note?.text.trim());
          const rowKey = `${getSongNoteKey(item)}:${String(item.id)}`;

          return (
            <div key={rowKey} className="p-4 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <span className="text-[11px] font-mono text-neutral-500 mr-2">
                    #{typeof item.id === 'number' ? item.id : index + 1}
                  </span>
                  <AnimeHoverCard
                    animeName={item.anime_name}
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
                      {highlightText(item.anime_name, searchQuery)}
                    </a>
                  </AnimeHoverCard>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {renderThemeBadge(item.theme_type)}
                  {item.anime_year && (
                    <span className="text-xs px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-neutral-400 font-mono">
                      {item.anime_year}
                    </span>
                  )}
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
                      className="truncate text-left underline decoration-dotted decoration-neutral-600 transition-colors hover:text-emerald-300"
                      title={`Find every song connected to ${item.artist} using the artist ID`}
                      aria-label={`Search all songs by ${item.artist}`}
                    >
                      {highlightText(item.artist, searchQuery)}
                    </button>
                  ) : (
                    <span className="truncate">{highlightText(item.artist || 'Unknown Artist', searchQuery)}</span>
                  )}
                </div>

                <div className="flex flex-shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onEditNote(item)}
                    className={`w-11 h-11 inline-flex items-center justify-center rounded-lg transition-colors ${
                      hasNote
                        ? 'text-amber-300 bg-amber-950/50'
                        : 'text-neutral-400 hover:text-amber-300 bg-neutral-800'
                    }`}
                    title={hasNote ? 'Edit personal note' : 'Add personal note'}
                    aria-label={`${hasNote ? 'Edit' : 'Add'} personal note for ${item.song_name || item.anime_name}`}
                  >
                    <StickyNote className={`w-3.5 h-3.5 ${hasNote ? 'fill-amber-300/20' : ''}`} />
                  </button>
                  {isCatalogMode ? (
                    <button
                      onClick={() => onSaveToCollection && onSaveToCollection(item as AnimeSongItem)}
                      disabled={isSaved}
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        isSaved
                          ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                          : 'bg-neutral-800 hover:bg-emerald-600 text-white'
                      }`}
                    >
                      {isSaved ? 'Saved' : '+ Save'}
                    </button>
                  ) : (
                    <>
                      {onEdit && (
                        <button
                          onClick={() => onEdit(item as AnimeSongEntry)}
                          className="p-1.5 rounded-md text-neutral-400 hover:text-emerald-400 bg-neutral-800"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {onDelete && typeof item.id === 'number' && (
                        <button
                          onClick={() => onDelete(item.id as number)}
                          aria-label={`Remove ${item.song_name || item.anime_name} from My Collection`}
                          className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-md text-neutral-400 hover:text-rose-400 bg-neutral-800"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
};
