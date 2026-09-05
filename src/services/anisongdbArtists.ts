import { AnimeSongItem, ArtistCredit } from '../types';
import { titlesFromAnisongDb } from './animeTitles';

const ANISONGDB_API = 'https://anisongdb.com/api';
const AMQ_MEDIA_BASE = 'https://naedist.animemusicquiz.com/';
const artistCreditsBySongId = new Map<number, ArtistCredit[]>();

interface ArtistSearchParams {
  yearMin?: number;
  yearMax?: number;
  themeType?: string;
  limit?: number;
  sortKey?: string;
  sortOrder?: string;
}

function asMediaUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const url = value.trim();
  return /^https?:\/\//i.test(url) ? url : `${AMQ_MEDIA_BASE}${url.replace(/^\/+/, '')}`;
}

function sanitizeArtistCredit(value: unknown): ArtistCredit | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const id = Number(candidate.id);
  if (!Number.isInteger(id)) return null;

  const nestedCredits = (nested: unknown): ArtistCredit[] | null => {
    if (!Array.isArray(nested)) return null;
    const credits = nested
      .map(sanitizeArtistCredit)
      .filter((credit): credit is ArtistCredit => credit !== null);
    return credits.length > 0 ? credits : null;
  };

  return {
    id,
    names: Array.isArray(candidate.names)
      ? candidate.names.filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
      : [],
    line_up_id: Number.isInteger(Number(candidate.line_up_id)) ? Number(candidate.line_up_id) : -1,
    groups: nestedCredits(candidate.groups),
    members: nestedCredits(candidate.members),
  };
}

function getThemeKind(themeType: unknown): 'OP' | 'ED' | 'IN' | '' {
  const value = String(themeType || '').toUpperCase();
  if (value.startsWith('OP') || value.includes('OPENING')) return 'OP';
  if (value.startsWith('ED') || value.includes('ENDING')) return 'ED';
  if (value.startsWith('IN') || value.includes('INSERT')) return 'IN';
  return '';
}

export function getAnnSongId(value: string | number): number | null {
  if (typeof value === 'number') return Number.isInteger(value) ? value : null;
  const match = String(value).trim().match(/^(?:song-)?(\d+)$/i);
  return match ? Number(match[1]) : null;
}

export function mapAnisongDbSong(value: unknown): AnimeSongItem | null {
  if (!value || typeof value !== 'object') return null;
  const song = value as Record<string, any>;
  const annSongId = Number(song.annSongId);
  if (!Number.isInteger(annSongId)) return null;

  const vintage = typeof song.animeVintage === 'string' ? song.animeVintage : null;
  const yearMatch = vintage?.match(/(\d{4})/) ?? null;
  const artists = Array.isArray(song.artists)
    ? song.artists
        .map(sanitizeArtistCredit)
        .filter((credit: ArtistCredit | null): credit is ArtistCredit => credit !== null)
    : [];

  if (artists.length > 0) artistCreditsBySongId.set(annSongId, artists);

  return {
    id: `song-${annSongId}`,
    ...titlesFromAnisongDb(song),
    anime_name: String(song.animeENName || song.animeJPName || 'Unknown Anime'),
    anime_year: yearMatch ? Number(yearMatch[1]) : 0,
    anime_vintage: vintage,
    artist: String(song.songArtist || 'Unknown Artist'),
    song_name: String(song.songName || 'Unknown Title'),
    theme_type: String(song.songType || ''),
    video_url: asMediaUrl(song.HQ) || asMediaUrl(song.MQ),
    audio_url: asMediaUrl(song.audio),
    anilist_id: Number.isInteger(Number(song.linked_ids?.anilist))
      ? Number(song.linked_ids.anilist)
      : null,
    source: 'anisongdb',
    artists,
  };
}

async function requestSongs(path: string, body: Record<string, unknown>): Promise<unknown[]> {
  const response = await fetch(`${ANISONGDB_API}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`AnisongDB request failed (${response.status})`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) throw new Error('AnisongDB returned an invalid song list');
  return payload;
}

/**
 * Attach stable artist IDs to bundled catalog rows without sending the user's
 * text query anywhere. Only ANN song IDs are sent to AnisongDB.
 */
export async function hydrateArtistCredits(songs: AnimeSongItem[]): Promise<AnimeSongItem[]> {
  const missingIds = Array.from(
    new Set(
      songs
        .filter((song) => !song.artists?.length)
        .map((song) => getAnnSongId(song.id))
        .filter((id): id is number => id !== null && !artistCreditsBySongId.has(id))
    )
  );

  for (let index = 0; index < missingIds.length; index += 500) {
    const chunk = missingIds.slice(index, index + 500);
    const payload = await requestSongs('ann_song_ids_request', { ann_song_ids: chunk });
    for (const rawSong of payload) mapAnisongDbSong(rawSong);
  }

  return songs.map((song) => {
    if (song.artists?.length) return song;
    const annSongId = getAnnSongId(song.id);
    const artists = annSongId === null ? undefined : artistCreditsBySongId.get(annSongId);
    return artists?.length ? { ...song, artists } : song;
  });
}

function filterAndSortSongs(songs: AnimeSongItem[], params: ArtistSearchParams) {
  const yearMin = params.yearMin === undefined ? null : Number(params.yearMin);
  const yearMax = params.yearMax === undefined ? null : Number(params.yearMax);
  const requestedTheme = String(params.themeType || 'ALL').toUpperCase();

  const filtered = songs.filter((song) => {
    const year = Number(song.anime_year);
    if (year && yearMin !== null && year < yearMin) return false;
    if (year && yearMax !== null && year > yearMax) return false;
    return requestedTheme === 'ALL' || getThemeKind(song.theme_type) === requestedTheme;
  });

  const key = String(params.sortKey || 'anime_year');
  const direction = String(params.sortOrder || 'desc').toLowerCase() === 'asc' ? 1 : -1;
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  filtered.sort((left, right) => {
    const leftValue = (left as any)[key];
    const rightValue = (right as any)[key];
    if (key === 'anime_year') {
      const comparison = (Number(leftValue) || 0) - (Number(rightValue) || 0);
      if (comparison !== 0) return comparison * direction;
    }
    const comparison = collator.compare(String(leftValue ?? ''), String(rightValue ?? ''));
    if (comparison !== 0) return comparison * direction;
    return collator.compare(left.anime_name, right.anime_name);
  });

  const total = filtered.length;
  const limit = Math.min(500, Math.max(1, Number(params.limit) || 500));
  return { data: filtered.slice(0, limit), total, hasMore: total > limit };
}

/** Search by canonical artist IDs so aliases, group credits, and same-name artists are resolved correctly. */
export async function searchSongsByArtistIds(ids: number[], params: ArtistSearchParams = {}) {
  const artistIds = Array.from(new Set(ids.filter((id) => Number.isInteger(id))));
  if (artistIds.length === 0) return { data: [], total: 0, hasMore: false };

  const payload = await requestSongs('artist_ids_request', {
    artist_ids: artistIds,
    group_granularity: 0,
    max_other_artist: 99,
  });
  const songs = payload
    .map(mapAnisongDbSong)
    .filter((song): song is AnimeSongItem => song !== null);
  return filterAndSortSongs(songs, params);
}
