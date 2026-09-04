import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Video,
  VideoOff,
  Maximize2,
  Minimize2,
  X,
  Disc3,
} from 'lucide-react';
import { usePlayer } from '../../context/PlayerContext';
import { fetchAnimeCoverDetails } from '../../services/api';

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export const MusicPlayer: React.FC = () => {
  const {
    currentTrack,
    isPlaying,
    isVideoVisible,
    currentTime,
    duration,
    volume,
    isMuted,
    videoRef,
    togglePlay,
    nextTrack,
    prevTrack,
    seek,
    setVolume,
    toggleMute,
    toggleVideo,
    closePlayer,
  } = usePlayer();

  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const pipContainerRef = useRef<HTMLDivElement>(null);

  // Load cover art dynamically if not provided on the track
  useEffect(() => {
    if (!currentTrack) {
      setPosterUrl(null);
      return;
    }

    if (currentTrack.image) {
      setPosterUrl(currentTrack.image);
      return;
    }

    setPosterUrl(null);
    let isMounted = true;
    fetchAnimeCoverDetails(currentTrack.animeTitle)
      .then((details) => {
        if (isMounted && details?.coverImage) {
          setPosterUrl(details.coverImage);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [currentTrack]);

  // Handle clicking scrub bar
  const handleScrubClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const fraction = Math.max(0, Math.min(1, clickX / rect.width));
    seek(fraction * duration);
  };

  // Fullscreen toggle for the video PiP container
  const handleToggleFullscreen = () => {
    if (!pipContainerRef.current) return;
    if (!document.fullscreenElement) {
      pipContainerRef.current
        .requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch((err) => console.warn('Fullscreen error:', err));
    } else {
      document
        .exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch((err) => console.warn('Exit fullscreen error:', err));
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <>
      {/*
        SINGLE <video> Element Architecture:
        The video tag is ALWAYS mounted in this container.
        When isVideoVisible is false: hidden via off-screen positioning and pointer-events-none.
        When isVideoVisible is true: displayed in a floating Picture-in-Picture window.
        This provides 0ms buffering, 0 desync, and uninterrupted audio playback.
      */}
      <div
        ref={pipContainerRef}
        className={
          isVideoVisible && currentTrack
            ? 'fixed bottom-24 right-4 z-50 w-80 sm:w-96 rounded-xl overflow-hidden shadow-2xl border border-neutral-700/90 bg-neutral-950/95 backdrop-blur-md transition-all duration-200 animate-in fade-in slide-in-from-bottom-4 flex flex-col'
            : 'fixed -top-[9999px] -left-[9999px] w-1 h-1 opacity-0 pointer-events-none overflow-hidden'
        }
        aria-hidden={!isVideoVisible}
      >
        {/* Floating PiP Header */}
        {isVideoVisible && currentTrack && (
          <div className="flex items-center justify-between px-3 py-2 bg-neutral-900/90 border-b border-neutral-800 text-xs text-neutral-300 select-none">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-semibold text-neutral-200 truncate">
                {currentTrack.animeTitle}
              </span>
              {currentTrack.type && (
                <span className="text-[10px] px-1 py-0.5 rounded bg-emerald-950 text-emerald-400 font-mono">
                  {currentTrack.type}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleToggleFullscreen}
                className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => toggleVideo(false)}
                className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                title="Hide Video (Keep Playing Audio)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* The single underlying HTML5 video element */}
        <div className="relative w-full aspect-video bg-black flex items-center justify-center">
          <video
            ref={videoRef}
            playsInline
            crossOrigin="anonymous"
            className="w-full h-full object-contain"
          />
        </div>
      </div>

      {/*
        Persistent Spotify-Style Fixed Bottom Mini-Player Bar
        Rendered whenever a track is selected/loaded
      */}
      {currentTrack && (
        <div
          id="spotify-music-player"
          className="fixed bottom-0 left-0 right-0 h-20 bg-neutral-900 border-t border-neutral-800 z-50 px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 shadow-2xl select-none"
        >
          {/* LEFT: Anime Poster, Title, and Theme Info */}
          <div className="flex items-center gap-3 min-w-0 w-[28%] sm:w-[30%]">
            <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-neutral-800 border border-neutral-700/60 flex-shrink-0 flex items-center justify-center shadow-inner">
              {posterUrl ? (
                <img
                  src={posterUrl}
                  alt={currentTrack.animeTitle}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={() => setPosterUrl(null)}
                />
              ) : (
                <Disc3 className="w-6 h-6 text-emerald-400/80 animate-spin-slow" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p
                  className="text-xs sm:text-sm font-semibold text-neutral-100 truncate hover:text-emerald-400 transition-colors"
                  title={currentTrack.animeTitle}
                >
                  {currentTrack.animeTitle}
                </p>
                {currentTrack.type && (
                  <span className="flex-shrink-0 px-1.5 py-0.2 rounded bg-emerald-950/80 border border-emerald-800/60 text-emerald-400 text-[10px] font-mono font-medium">
                    {currentTrack.type}
                  </span>
                )}
              </div>
              <p
                className="text-[11px] sm:text-xs text-neutral-400 truncate mt-0.5"
                title={`${currentTrack.songName || 'Theme Song'} ${currentTrack.artist ? `— ${currentTrack.artist}` : ''}`}
              >
                {currentTrack.songName || 'Theme Song'}
                {currentTrack.artist && (
                  <span className="text-neutral-500"> — {currentTrack.artist}</span>
                )}
              </p>
            </div>
          </div>

          {/* CENTER: Prev, Play/Pause, Next controls and Clickable Progress Bar */}
          <div className="flex flex-col items-center justify-center flex-1 max-w-xl px-2">
            {/* Playback Controls */}
            <div className="flex items-center gap-3 sm:gap-4 mb-1.5">
              <button
                type="button"
                onClick={prevTrack}
                className="p-1 text-neutral-400 hover:text-neutral-100 transition-colors cursor-pointer"
                title="Previous Track"
                aria-label="Previous Track"
              >
                <SkipBack className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={togglePlay}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-neutral-950 flex items-center justify-center shadow-lg transition-all cursor-pointer"
                title={isPlaying ? 'Pause' : 'Play'}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 fill-neutral-950 text-neutral-950" />
                ) : (
                  <Play className="w-4 h-4 fill-neutral-950 text-neutral-950 ml-0.5" />
                )}
              </button>

              <button
                type="button"
                onClick={nextTrack}
                className="p-1 text-neutral-400 hover:text-neutral-100 transition-colors cursor-pointer"
                title="Next Track"
                aria-label="Next Track"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>

            {/* Clickable Progress Bar & Timestamp Labels */}
            <div className="w-full flex items-center gap-2 text-[10px] sm:text-[11px] text-neutral-400 font-mono">
              <span className="w-8 sm:w-9 text-right tabular-nums">
                {formatTime(currentTime)}
              </span>

              <div
                role="slider"
                aria-label="Audio progress bar"
                aria-valuenow={currentTime}
                aria-valuemin={0}
                aria-valuemax={duration || 0}
                onClick={handleScrubClick}
                className="relative flex-1 h-1.5 sm:h-2 bg-neutral-800 hover:h-2.5 rounded-full cursor-pointer transition-all group overflow-hidden"
              >
                <div
                  className="h-full bg-emerald-500 rounded-full transition-[width] duration-75 relative"
                  style={{ width: `${progressPercent}%` }}
                >
                  <span className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>

              <span className="w-8 sm:w-9 text-left tabular-nums">
                {formatTime(duration)}
              </span>
            </div>
          </div>

          {/* RIGHT: Show Video / Video ON Toggle, Mute Button, Volume Slider, Dismiss */}
          <div className="flex items-center justify-end gap-2 sm:gap-3 w-[28%] sm:w-[30%]">
            {/* Show Video / Video ON Toggle */}
            <button
              type="button"
              onClick={() => toggleVideo()}
              className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
                isVideoVisible
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                  : 'bg-neutral-800 text-neutral-300 border-neutral-700/80 hover:bg-neutral-700 hover:text-white'
              }`}
              title={isVideoVisible ? 'Hide Video (Audio continues)' : 'Show Video (PiP)'}
            >
              {isVideoVisible ? (
                <VideoOff className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              ) : (
                <Video className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
              )}
              <span className="hidden sm:inline">
                {isVideoVisible ? 'Video ON' : 'Show Video'}
              </span>
            </button>

            {/* Volume and Mute Controls */}
            <div className="hidden md:flex items-center gap-2">
              <button
                type="button"
                onClick={toggleMute}
                className="text-neutral-400 hover:text-neutral-100 transition-colors cursor-pointer p-1"
                title={isMuted ? 'Unmute' : 'Mute'}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>

              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={isMuted ? 0 : volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-16 sm:w-20 h-1 bg-neutral-700 accent-emerald-500 rounded-lg cursor-pointer"
                title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
                aria-label="Volume slider"
              />
            </div>

            {/* Close / Dismiss mini-player */}
            <button
              type="button"
              onClick={closePlayer}
              className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 transition-colors cursor-pointer"
              title="Close Player"
              aria-label="Close Player"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
