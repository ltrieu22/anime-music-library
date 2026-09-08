import type { AnimeSongItem } from '../types';
import { DEFAULT_CATALOG_STATE, serializeCatalogUrl } from './catalogUrlState';

export type ShareIdentity = { id?: string | number; source_song_id?: string | number };
export function publicSongId(song: ShareIdentity): string | null {
  const id = song.source_song_id ?? song.id;
  return typeof id === 'string' && /^song-\d+$/.test(id) ? id : null;
}
export function songShareUrl(song: ShareIdentity, base: URL): string | null {
  const id = publicSongId(song);
  if (!id) return null;
  // A song link does not need the current query (which may match personal notes).
  const url = serializeCatalogUrl(DEFAULT_CATALOG_STATE, base);
  url.searchParams.set('play', id);
  return url.href;
}
export function resolveSharedSong(id: string, catalog: readonly AnimeSongItem[]): AnimeSongItem {
  if (!/^song-\d+$/.test(id)) throw new Error('This song link has an invalid song ID.');
  if (!catalog.length) throw new Error('The catalog could not be loaded. Reload the page to try this song link again.');
  const song = catalog.find(song => String(song.id) === id);
  if (!song) throw new Error('This shared song is no longer in the public catalog.');
  if (!song.video_url?.trim() && !song.audio_url?.trim()) throw new Error('This shared song has no playable media.');
  return song;
}

type SharePlatform = {
  share?: (data: ShareData) => Promise<void>;
  clipboard?: { writeText: (text: string) => Promise<void> };
};
export type ShareResult = 'shared' | 'cancelled' | 'copied' | 'manual';
export async function shareSongLink(url: string, platform: SharePlatform, copyOnly = false, title = 'Anime song'): Promise<ShareResult> {
  if (!copyOnly && platform.share) {
    try {
      await platform.share({ title, url });
      return 'shared';
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
      // A failed or disallowed native share still offers a usable link.
    }
  }
  try {
    if (!platform.clipboard) return 'manual';
    await platform.clipboard.writeText(url);
    return 'copied';
  } catch { return 'manual'; }
}
