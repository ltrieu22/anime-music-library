import { AnimeSongItem, ArtistCredit } from '../types';
import { titlesFromAnisongDb } from './animeTitles';
import { searchCatalogResults, type CatalogParams } from './catalogResults';

const ANISONGDB_API = 'https://anisongdb.com/api';
const AMQ_MEDIA_BASE = 'https://naedist.animemusicquiz.com/';
const artistCreditsBySongId = new Map<number, ArtistCredit[]>();

type ArtistSearchParams = Omit<CatalogParams, 'q'>;
const artistResults = new Map<string, Promise<AnimeSongItem[]>>();

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

/** Search by canonical artist IDs so aliases, group credits, and same-name artists are resolved correctly. */
export async function searchSongsByArtistIds(ids: number[], params: ArtistSearchParams = {}) {
  const artistIds = Array.from(new Set(ids.filter((id) => Number.isInteger(id)))).sort((a, b) => a - b);
  if (artistIds.length === 0) return searchCatalogResults([], {}, params);
  const key = artistIds.join(',');
  let pending = artistResults.get(key);
  if (!pending) {
    pending = requestSongs('artist_ids_request', {
      artist_ids: artistIds,
      group_granularity: 0,
      max_other_artist: 99,
    }).then((payload) => payload.map(mapAnisongDbSong)
      .filter((song): song is AnimeSongItem => song !== null));
    artistResults.set(key, pending);
    pending.catch(() => artistResults.delete(key));
  }
  return searchCatalogResults(await pending, {}, params);
}
