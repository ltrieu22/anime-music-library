import React, {
  createContext,
  useContext,
  useState,
  useReducer,
  useRef,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { QueueItem, QueueSource, RepeatMode, SongTrack } from '../types/player';
import { canAdvanceQueue, currentQueueItem, initialQueueState, queueReducer } from '../services/playerQueue';
import { readStoredPlayerVolume, sanitizePlayerVolume, writeStoredPlayerVolume } from '../services/playerVolume';
import { fetchAnimeCoverUrl } from '../services/api';

// Debounce for volume persistence so slider drags settle before storage writes.
const VOLUME_PERSIST_DELAY_MS = 150;

export function resolveVideoUrl(url?: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  const clean = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
  return `https://naedist.animemusicquiz.com/${clean}`;
}

export interface PlayerContextType {
  currentTrack: SongTrack | null;
  /** Compatibility view including history/current/upcoming; edit via queue-item IDs. */
  queue: SongTrack[];
  queueIndex: number;
  queueSource: QueueSource;
  queueItems: QueueItem[];
  currentQueueItem: QueueItem | null;
  upcomingQueueItems: QueueItem[];
  canSkipNext: boolean;
  repeatMode: RepeatMode;
  setRepeatMode: (mode: RepeatMode) => void;
  isPlaying: boolean;
  playbackNotice: string;
  isVideoVisible: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  playTrack: (track: SongTrack, newQueue?: SongTrack[]) => void;
  playQueue: (tracks: SongTrack[], startIndex?: number) => void;
  /** Append without interruption; an empty player starts a manual queue. */
  addToQueue: (tracks: SongTrack | SongTrack[]) => void;
  /** Insert immediately after current without interruption; starts an empty player. */
  playNext: (tracks: SongTrack | SongTrack[]) => void;
  /** Current removal plays its successor, or closes if there is no successor. */
  removeQueueItem: (queueItemId: string) => void;
  /** Retain current/history and the explicit repeat setting. */
  clearUpcoming: () => void;
  /** Move only upcoming items; target is zero-based within upcomingQueueItems. */
  moveQueueItem: (queueItemId: string, upcomingIndex: number) => void;
  togglePlay: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  seek: (timeInSeconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleVideo: (visible?: boolean) => void;
  closePlayer: () => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export const PlayerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [queueState, dispatchQueue] = useReducer(queueReducer, initialQueueState);
  const activeItem = currentQueueItem(queueState);
  const currentTrack = activeItem?.track ?? null;
  useEffect(() => {
    let cancelled = false;
    // Warm only the current and next track, serially, to avoid unnecessary
    // provider calls for songs the listener may never reach.
    const warmCovers = async () => {
      for (const { track } of queueState.items.slice(queueState.index, queueState.index + 2)) {
        if (cancelled) break;
        try {
          const url = track.image || await fetchAnimeCoverUrl(track.animeTitle, track.anilistId);
          if (cancelled) break;
          if (url) {
            const image = new Image();
            image.src = url;
          }
        } catch { /* Artwork must not interrupt playback. */ }
      }
    };
    void warmCovers();
    return () => { cancelled = true; };
  }, [queueState.items, queueState.index]);
  const [playbackNotice, setPlaybackNotice] = useState('');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isVideoVisible, setIsVideoVisible] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  // Initialize from the versioned preference; falls back to 40% when absent,
  // corrupted, or unsupported.
  const persistedVolumeRef = useRef<number>(-1);
  const [volume, setVolumeState] = useState<number>(() => {
    const initial = readStoredPlayerVolume();
    persistedVolumeRef.current = initial;
    return initial;
  });
  // Mute is transient and never persisted: the player starts unmuted at the
  // remembered gain.
  const [isMuted, setIsMuted] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Mirrors for event listeners attached once per track (avoids stale closures).
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

  // Persist the remembered (unmuted) volume when it differs from the stored
  // preference. A failed write leaves the previous preference marked as
  // stored so the next change retries.
  useEffect(() => {
    if (volume === persistedVolumeRef.current) return;
    const timeoutId = window.setTimeout(() => {
      if (writeStoredPlayerVolume(volume)) {
        persistedVolumeRef.current = volume;
      }
    }, VOLUME_PERSIST_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [volume]);

  // Keep the media element's gain in step with the shared preference,
  // including a freshly mounted element and native-control mutations.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = isMuted;
  }, [volume, isMuted]);

  // A title click replaces the queue. Only collection clicks supply a playlist.
  const playTrack = useCallback((track: SongTrack, newQueue?: SongTrack[]) => {
    const idx = newQueue?.findIndex((t) => String(t.id) === String(track.id)) ?? -1;
    if (newQueue && idx >= 0) {
      dispatchQueue({ type: 'replace', tracks: newQueue, startIndex: idx, source: 'collection' });
    } else {
      dispatchQueue({ type: 'replace', tracks: [track], source: 'single' });
    }
  }, []);

  // Play an entire queue from an index
  const playQueue = useCallback((tracks: SongTrack[], startIndex: number = 0) => {
    dispatchQueue({ type: 'replace', tracks, startIndex, source: 'collection' });
  }, []);

  const addToQueue = useCallback((tracks: SongTrack | SongTrack[]) => {
    dispatchQueue({ type: 'append', tracks: Array.isArray(tracks) ? tracks : [tracks] });
  }, []);
  const playNext = useCallback((tracks: SongTrack | SongTrack[]) => {
    dispatchQueue({ type: 'playNext', tracks: Array.isArray(tracks) ? tracks : [tracks] });
  }, []);
  const setRepeatMode = useCallback((mode: RepeatMode) => dispatchQueue({ type: 'setRepeat', mode }), []);
  const removeQueueItem = useCallback((queueItemId: string) => {
    dispatchQueue({ type: 'remove', queueItemId });
  }, []);
  const clearUpcoming = useCallback(() => dispatchQueue({ type: 'clearUpcoming' }), []);
  const moveQueueItem = useCallback((queueItemId: string, upcomingIndex: number) => {
    dispatchQueue({ type: 'moveUpcoming', queueItemId, toIndex: upcomingIndex });
  }, []);

  // Toggle playback
  const togglePlay = useCallback(() => {
    if (!currentTrack || !videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      if (videoRef.current.error) videoRef.current.load();
      if (videoRef.current.ended) videoRef.current.currentTime = 0;
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => {
          console.warn('Playback resume failed:', err);
          setIsPlaying(false);
          setPlaybackNotice(err?.name === 'NotAllowedError' ? 'Playback is paused. Press Play to listen.' : 'This media could not be played. Press Play to retry.');
        });
    }
  }, [currentTrack, isPlaying]);

  // Next track
  const nextTrack = useCallback(() => {
    dispatchQueue({ type: 'next' });
  }, []);

  // Previous track (if > 3 seconds in, restart current track; otherwise go back)
  const prevTrack = useCallback(() => {
    if (!currentTrack) return;
    if ((currentTime > 3 || (queueState.index === 0 && queueState.repeatMode !== 'all')) && videoRef.current) {
      videoRef.current.currentTime = 0;
      setCurrentTime(0);
      return;
    }
    dispatchQueue({ type: 'previous' });
  }, [currentTrack, queueState.repeatMode, queueState.index, currentTime]);

  // Seek
  const seek = useCallback((timeInSeconds: number) => {
    if (videoRef.current) {
      const clamped = Math.max(0, Math.min(timeInSeconds, duration || 0));
      videoRef.current.currentTime = clamped;
      setCurrentTime(clamped);
    }
  }, [duration]);

  // Volume
  const setVolume = useCallback((newVol: number) => {
    const clamped = sanitizePlayerVolume(newVol);
    if (clamped === null) return;
    setVolumeState(clamped);
    if (videoRef.current) {
      videoRef.current.volume = clamped;
    }
    if (clamped > 0 && isMutedRef.current) {
      setIsMuted(false);
      if (videoRef.current) {
        videoRef.current.muted = false;
      }
    }
  }, []);

  // Mute. Unmuting restores the remembered gain; the stored preference keeps
  // tracking the unmuted volume regardless of mute state.
  const toggleMute = useCallback(() => {
    const next = !isMutedRef.current;
    setIsMuted(next);
    const video = videoRef.current;
    if (video) {
      video.muted = next;
      if (!next) video.volume = volumeRef.current;
    }
  }, []);

  // Toggle video display overlay
  const toggleVideo = useCallback((visible?: boolean) => {
    setIsVideoVisible((prev) => (visible !== undefined ? visible : !prev));
  }, []);

  // Close player
  const closePlayer = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
    setIsPlaying(false);
    dispatchQueue({ type: 'close' });
    setIsVideoVisible(false);
  }, []);

  // Queue edits retain the current track and revision, so they never reload media.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setPlaybackNotice('');
    if (!currentTrack) {
      video.pause();
      video.removeAttribute('src');
      video.load();
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setIsVideoVisible(false);
      return;
    }

    const resolvedUrl = resolveVideoUrl(currentTrack.videoUrl);
    if (!resolvedUrl) {
      console.warn('Track has no valid videoUrl:', currentTrack);
      return;
    }

    video.src = resolvedUrl;
    setCurrentTime(0);
    setDuration(0);
    // Apply the remembered gain before playback so the track never starts at
    // the element's full-volume default; muting silences without discarding it.
    video.volume = volumeRef.current;
    video.muted = isMutedRef.current;

    let cancelled = false;
    video
      .play()
      .then(() => {
        if (!cancelled) setIsPlaying(true);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('Auto-play blocked or failed:', err);
        setPlaybackNotice(err?.name === 'NotAllowedError' ? 'Playback is paused. Press Play to listen.' : 'This media could not be played. Press Play to retry.');
        setIsPlaying(false);
      });
    return () => { cancelled = true; };
  }, [currentTrack, queueState.playbackRevision]);

  // Attach native HTML5 video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration || 0);
    };

    const handlePlay = () => {
      setPlaybackNotice('');
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      dispatchQueue({ type: 'ended' });
    };

    // Native controls (visible video, fullscreen) can change gain or mute
    // outside React state; mirror them into the shared preference.
    const handleVolumeChange = () => {
      const elementVolume = sanitizePlayerVolume(video.volume);
      if (elementVolume !== null && elementVolume !== volumeRef.current) {
        setVolumeState(elementVolume);
      }
      if (video.muted !== isMutedRef.current) {
        setIsMuted(video.muted);
      }
    };

    const handleError = () => {
      setIsPlaying(false);
      setPlaybackNotice('This media could not be loaded. Press Play to retry.');
    };
    video.addEventListener('error', handleError);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('volumechange', handleVolumeChange);

    return () => {
      video.removeEventListener('error', handleError);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('volumechange', handleVolumeChange);
    };
  }, []);

  return (
    <PlayerContext.Provider
      value={{
        currentTrack,
        queue: queueState.items.map(item => item.track),
        queueIndex: queueState.index,
        queueSource: queueState.source,
        queueItems: queueState.items,
        currentQueueItem: activeItem,
        upcomingQueueItems: queueState.items.slice(queueState.index + 1),
        canSkipNext: canAdvanceQueue(queueState),
        repeatMode: queueState.repeatMode,
        setRepeatMode,
        isPlaying,
        playbackNotice,
        isVideoVisible,
        currentTime,
        duration,
        volume,
        isMuted,
        videoRef,
        playTrack,
        playQueue,
        addToQueue,
        playNext,
        removeQueueItem,
        clearUpcoming,
        moveQueueItem,
        togglePlay,
        nextTrack,
        prevTrack,
        seek,
        setVolume,
        toggleMute,
        toggleVideo,
        closePlayer,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
};

export const usePlayer = (): PlayerContextType => {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return context;
};
