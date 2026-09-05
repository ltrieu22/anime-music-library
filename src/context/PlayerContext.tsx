import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { SongTrack } from '../types/player';

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
  queue: SongTrack[];
  queueIndex: number;
  queueSource: 'collection' | 'single' | null;
  canSkipNext: boolean;
  isPlaying: boolean;
  isVideoVisible: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  playTrack: (track: SongTrack, newQueue?: SongTrack[]) => void;
  playQueue: (tracks: SongTrack[], startIndex?: number) => void;
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
  const [currentTrack, setCurrentTrack] = useState<SongTrack | null>(null);
  const [queue, setQueue] = useState<SongTrack[]>([]);
  const [queueIndex, setQueueIndex] = useState<number>(-1);
  const [queueSource, setQueueSource] = useState<'collection' | 'single' | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isVideoVisible, setIsVideoVisible] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolumeState] = useState<number>(0.8);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // A title click replaces the queue. Only collection clicks supply a playlist.
  const playTrack = useCallback((track: SongTrack, newQueue?: SongTrack[]) => {
    const idx = newQueue?.findIndex((t) => String(t.id) === String(track.id)) ?? -1;
    if (newQueue && idx >= 0) {
      setQueue(newQueue);
      setQueueIndex(idx);
      setQueueSource('collection');
    } else {
      setQueue([track]);
      setQueueIndex(0);
      setQueueSource('single');
    }

    setCurrentTrack(track);
    setIsPlaying(true);
  }, []);

  // Play an entire queue from an index
  const playQueue = useCallback((tracks: SongTrack[], startIndex: number = 0) => {
    if (tracks.length === 0) return;
    const clampedIndex = Math.max(0, Math.min(startIndex, tracks.length - 1));
    setQueue(tracks);
    setQueueIndex(clampedIndex);
    setQueueSource('collection');
    setCurrentTrack(tracks[clampedIndex]);
    setIsPlaying(true);
  }, []);

  // Toggle playback
  const togglePlay = useCallback(() => {
    if (!currentTrack || !videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      if (videoRef.current.ended) videoRef.current.currentTime = 0;
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => {
          console.warn('Playback resume failed:', err);
          setIsPlaying(false);
        });
    }
  }, [currentTrack, isPlaying]);

  // Next track
  const nextTrack = useCallback(() => {
    if (queueSource !== 'collection' || queue.length === 0) return;
    const nextIdx = (queueIndex + 1) % queue.length;
    setQueueIndex(nextIdx);
    setCurrentTrack({ ...queue[nextIdx] });
    setIsPlaying(true);
  }, [queue, queueIndex, queueSource]);

  // Previous track (if > 3 seconds in, restart current track; otherwise go back)
  const prevTrack = useCallback(() => {
    if (queue.length === 0) return;
    if ((currentTime > 3 || queueSource === 'single') && videoRef.current) {
      videoRef.current.currentTime = 0;
      setCurrentTime(0);
      return;
    }
    const prevIdx = queueIndex > 0 ? queueIndex - 1 : queue.length - 1;
    setQueueIndex(prevIdx);
    setCurrentTrack({ ...queue[prevIdx] });
    setIsPlaying(true);
  }, [queue, queueIndex, queueSource, currentTime]);

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
    const clamped = Math.max(0, Math.min(1, newVol));
    setVolumeState(clamped);
    if (videoRef.current) {
      videoRef.current.volume = clamped;
    }
    if (clamped > 0 && isMuted) {
      setIsMuted(false);
      if (videoRef.current) {
        videoRef.current.muted = false;
      }
    }
  }, [isMuted]);

  // Mute
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (videoRef.current) {
        videoRef.current.muted = next;
      }
      return next;
    });
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
    setCurrentTrack(null);
    setQueue([]);
    setQueueIndex(-1);
    setQueueSource(null);
    setIsVideoVisible(false);
  }, []);

  // Keep video source and playback synced whenever currentTrack changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!currentTrack) {
      video.pause();
      video.removeAttribute('src');
      video.load();
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
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
    video.volume = isMuted ? 0 : volume;
    video.muted = isMuted;

    let cancelled = false;
    video
      .play()
      .then(() => {
        if (!cancelled) setIsPlaying(true);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('Auto-play blocked or failed:', err);
        setIsPlaying(false);
      });
    return () => { cancelled = true; };
  }, [currentTrack]);

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
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handleEnded = () => {
      if (queueSource === 'collection') {
        nextTrack();
      } else {
        setIsPlaying(false);
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    };
  }, [nextTrack, currentTrack, queueSource]);

  return (
    <PlayerContext.Provider
      value={{
        currentTrack,
        queue,
        queueIndex,
        queueSource,
        canSkipNext: queueSource === 'collection' && queue.length > 1,
        isPlaying,
        isVideoVisible,
        currentTime,
        duration,
        volume,
        isMuted,
        videoRef,
        playTrack,
        playQueue,
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
