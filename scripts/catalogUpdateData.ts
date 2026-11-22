import { isDeepStrictEqual } from 'node:util';
import { getSongMetadataFingerprint, getLegacySongFingerprints } from '../src/services/notesStorage';
import type { AnimeSongItem } from '../src/types';

const mediaBase = 'https://naedist.animemusicquiz.com/';
type CatalogSong = AnimeSongItem & { id: string };

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const positiveId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const hasText = (value: unknown): value is string => typeof value === 'string' && !!value.trim();

function mediaUrl(value: unknown, id: string): string | null {
  if (value === null || value === '') return null;
  if (!hasText(value)) throw new Error(`${id} has an invalid media value`);
  const file = value.trim();
  if (/^https?:\/\//i.test(file)) {
    if (!URL.canParse(file)) throw new Error(`${id} has an invalid media URL`);
    return file;
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(file) || file.startsWith('//')) throw new Error(`${id} has an invalid media URL`);
  return mediaBase + file.replace(/^\/+/, '');
}

export function catalogFromDump(dump: unknown): Map<string, CatalogSong> {
  if (!record(dump) || !record(dump.anime) || !record(dump.artists) || !Array.isArray(dump.songs) || !dump.songs.length) {
    throw new Error('AniSongDB returned an invalid or empty catalog dump');
  }
  const catalog = new Map<string, CatalogSong>();
  for (const song of dump.songs) {
    if (!record(song) || !positiveId(song.annSongId) || !positiveId(song.annId)) {
      throw new Error('Invalid ANN song or anime ID in AniSongDB dump');
    }
    const id = `song-${song.annSongId}`;
    if (catalog.has(id)) throw new Error(`Duplicate ANN song ID ${id}`);
    const anime = dump.anime[song.annId];
    if (!record(anime) || !record(anime.linked_ids)
      || !Array.isArray(anime.animeAltName) || !anime.animeAltName.every(name => typeof name === 'string')
      || (anime.animeENName !== null && typeof anime.animeENName !== 'string')
      || (anime.animeJPName !== null && typeof anime.animeJPName !== 'string')
      || (anime.animeVintage !== null && typeof anime.animeVintage !== 'string')
      || (anime.linked_ids.anilist !== null && !positiveId(anime.linked_ids.anilist))) {
      throw new Error(`${id} has invalid anime metadata`);
    }
    const english = hasText(anime.animeENName) ? anime.animeENName : null;
    const romaji = hasText(anime.animeJPName) ? anime.animeJPName : null;
    const title = english ?? romaji;
    if (!title) throw new Error(`${id} has no anime title in either language`);
    if (!hasText(song.songName) || typeof song.songArtist !== 'string'
      || (song.songType !== 1 && song.songType !== 2 && song.songType !== 3)
      || (song.songType !== 3 && !positiveId(song.songNumber))) {
      throw new Error(`${id} has invalid song metadata`);
    }
    const video = mediaUrl(song.HQ, id);
    const fallbackVideo = mediaUrl(song.MQ, id);
    const vintage = typeof anime.animeVintage === 'string' ? anime.animeVintage : null;
    const anilistId = positiveId(anime.linked_ids.anilist) ? anime.linked_ids.anilist : null;
    catalog.set(id, {
      id,
      anime_name: title,
      anime_year: Number(vintage?.match(/\d{4}/)?.[0] ?? 0),
      anime_vintage: vintage,
      artist: song.songArtist,
      song_name: song.songName,
      theme_type: song.songType === 3 ? 'Insert Song' : `${song.songType === 1 ? 'Opening' : 'Ending'} ${song.songNumber}`,
      video_url: video ?? fallbackVideo,
      audio_url: mediaUrl(song.audio, id),
      anilist_id: anilistId,
      anime_name_english: english ?? title,
      anime_name_romaji: romaji ?? title,
      anime_alt_names: anime.animeAltName,
    });
  }
  return catalog;
}

export function catalogSummary(catalog: readonly AnimeSongItem[]) {
  let minYear = Infinity;
  let maxYear = -Infinity;
  const counts = { opening: 0, ending: 0, insert: 0, bilingual: 0, withAlternateNames: 0 };
  const ids = new Set<string>();
  for (const song of catalog) {
    if (typeof song.id !== 'string' || !/^song-[1-9]\d*$/.test(song.id) || ids.has(song.id)) {
      throw new Error(`Invalid or duplicate catalog ID ${song.id}`);
    }
    ids.add(song.id);
    if (song.anime_year > 0) {
      minYear = Math.min(minYear, song.anime_year);
      maxYear = Math.max(maxYear, song.anime_year);
    }
    if (hasText(song.anime_name_english) && hasText(song.anime_name_romaji)) counts.bilingual++;
    if (song.anime_alt_names?.length) counts.withAlternateNames++;
    if (song.theme_type?.startsWith('Opening ')) counts.opening++;
    else if (song.theme_type?.startsWith('Ending ')) counts.ending++;
    else if (song.theme_type === 'Insert Song') counts.insert++;
    else throw new Error(`Unknown theme type for ${song.id}`);
  }
  if (!Number.isFinite(minYear)) throw new Error('Catalog has no known years');
  return { tracks: catalog.length, minYear, maxYear, ...counts };
}

export function mergeCatalog(previous: CatalogSong[], upstream: ReadonlyMap<string, CatalogSong>) {
  const previousIds = new Set(previous.map(song => song.id));
  const added = [...upstream.values()].filter(song => !previousIds.has(song.id))
    .sort((a, b) => Number(a.id.slice(5)) - Number(b.id.slice(5)));
  const retained = previous.filter(song => !upstream.has(song.id)).map(song => song.id);
  const changes: { id: string; fields: string[] }[] = [];
  const preservedMedia: { id: string; field: 'video_url' | 'audio_url' }[] = [];
  const ambiguousFingerprints = new Set<string>();
  const owners = new Map<string, string | null>();
  for (const song of [...previous, ...upstream.values()]) {
    for (const fingerprint of [getSongMetadataFingerprint(song), ...getLegacySongFingerprints(song)]) {
      const owner = owners.get(fingerprint);
      owners.set(fingerprint, owner === undefined || owner === song.id ? song.id : null);
    }
  }
  const catalog = previous.map(before => {
    const latest = upstream.get(before.id);
    const after = { ...before, ...latest };
    delete after.legacy_song_fingerprints;
    if (latest) {
      for (const field of ['video_url', 'audio_url'] as const) {
        if (before[field] && latest[field] === null) {
          after[field] = before[field];
          preservedMedia.push({ id: before.id, field });
        }
      }
      const fields = Object.keys(latest).filter(field => !isDeepStrictEqual(before[field], latest[field]));
      if (fields.length) changes.push({ id: before.id, fields });
    }

    const current = getSongMetadataFingerprint(after);
    const history = new Set([...getLegacySongFingerprints(before), getSongMetadataFingerprint(before)]);
    history.delete(current);
    const legacy = [...history].filter(fingerprint => {
      if (owners.get(fingerprint) === before.id) return true;
      ambiguousFingerprints.add(before.id);
      return false;
    });
    if (legacy.length) after.legacy_song_fingerprints = legacy;
    return after;
  }).concat(added);
  return {
    catalog,
    added: added.map(song => song.id),
    changes,
    retained,
    preservedMedia,
    withoutMedia: added.filter(song => !song.video_url && !song.audio_url).map(song => song.id),
    ambiguousFingerprints: [...ambiguousFingerprints],
  };
}
