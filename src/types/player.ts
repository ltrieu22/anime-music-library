import type { TitleSource } from '../services/animeTitles';
import type { AnimeSongEntry, AnimeSongItem, NoteSongSnapshot } from '../types';

export type PlayerActionSong = AnimeSongEntry | AnimeSongItem | NoteSongSnapshot;

export interface SongTrack {
  id: string | number;
  animeTitle: string;
  animeTitles?: TitleSource;
  songName?: string;
  artist?: string;
  type?: string;
  anilistId?: number | null;
  image?: string;
  videoUrl: string; // e.g. "https://naedist.animemusicquiz.com/...webm" or "....webm"
  /** Original song identity and metadata used by actions exposed from the player. */
  actionSong?: PlayerActionSong;
}

/** Playback occurrence identity; SongTrack.id still identifies the source song. */
export interface QueueItem {
  queueItemId: string;
  track: SongTrack;
}

export type QueueSource = 'collection' | 'single' | 'manual' | null;
