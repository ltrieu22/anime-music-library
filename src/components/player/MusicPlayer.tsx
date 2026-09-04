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

const PIP_MIN_WIDTH = 280;
const PIP_MAX_WIDTH = 720;
const PIP_DEFAULT_WIDTH = 384;
const PIP_VIEWPORT_MARGIN = 8;
const PLAYER_BAR_FALLBACK_HEIGHT = 80;
const PIP_VIDEO_ASPECT_RATIO = 16 / 9;
const PIP_LAYOUT_STORAGE_KEY = 'anime-db:pip-layout-v1';

type PipCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

interface PipLayout {
  x: number | null;
  y: number | null;
  width: number;
  corner: PipCorner | null;
}

interface PipPointerInteraction {
  kind: 'drag' | 'resize';
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startLeft: number;
  startTop: number;
  startWidth: number;
  startHeight: number;
  startRight: number;
  startBottom: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function getPipChromeHeight(container: HTMLElement): number {
  const styles = window.getComputedStyle(container);
  const width = Number.parseFloat(styles.width);
  const height = Number.parseFloat(styles.height);
  return Math.max(0, height - width / PIP_VIDEO_ASPECT_RATIO);
}

function isPipCorner(value: unknown): value is PipCorner {
  return (
    value === 'top-left' ||
    value === 'top-right' ||
    value === 'bottom-left' ||
    value === 'bottom-right'
  );
}

function getPipCornerPosition(
  corner: PipCorner,
  width: number,
  height: number,
  viewportWidth: number,
  bottomBoundary: number
): { x: number; y: number } {
  const x = corner.endsWith('right')
    ? Math.max(PIP_VIEWPORT_MARGIN, viewportWidth - width - PIP_VIEWPORT_MARGIN)
    : PIP_VIEWPORT_MARGIN;
  const y = corner.startsWith('bottom')
    ? Math.max(PIP_VIEWPORT_MARGIN, bottomBoundary - height)
    : PIP_VIEWPORT_MARGIN;

  return { x, y };
}

function getNearestPipCorner(
  left: number,
  top: number,
  width: number,
  height: number,
  viewportWidth: number,
  bottomBoundary: number
): PipCorner {
  const horizontalSide = left + width / 2 < viewportWidth / 2 ? 'left' : 'right';
  const verticalMidpoint = (PIP_VIEWPORT_MARGIN + bottomBoundary) / 2;
  const verticalSide = top + height / 2 < verticalMidpoint ? 'top' : 'bottom';
  return `${verticalSide}-${horizontalSide}` as PipCorner;
}

function getInitialPipLayout(): PipLayout {
  const viewportWidth = typeof window === 'undefined' ? PIP_DEFAULT_WIDTH : window.innerWidth;
  const fallbackWidth = clamp(
    PIP_DEFAULT_WIDTH,
    Math.min(PIP_MIN_WIDTH, Math.max(1, viewportWidth - PIP_VIEWPORT_MARGIN * 2)),
    Math.min(PIP_MAX_WIDTH, Math.max(1, viewportWidth - PIP_VIEWPORT_MARGIN * 2))
  );

  if (typeof window === 'undefined') {
    return { x: null, y: null, width: fallbackWidth, corner: 'bottom-right' };
  }

  try {
    const savedLayout = JSON.parse(window.localStorage.getItem(PIP_LAYOUT_STORAGE_KEY) || 'null');
    if (!savedLayout || !Number.isFinite(savedLayout.width)) {
      return { x: null, y: null, width: fallbackWidth, corner: 'bottom-right' };
    }

    return {
      x: Number.isFinite(savedLayout.x) ? savedLayout.x : null,
      y: Number.isFinite(savedLayout.y) ? savedLayout.y : null,
      width: clamp(savedLayout.width, PIP_MIN_WIDTH, PIP_MAX_WIDTH),
      corner: isPipCorner(savedLayout.corner) ? savedLayout.corner : null,
    };
  } catch {
    return { x: null, y: null, width: fallbackWidth, corner: 'bottom-right' };
  }
}

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
  const [pipLayout, setPipLayout] = useState<PipLayout>(getInitialPipLayout);
  const [pipInteraction, setPipInteraction] = useState<'drag' | 'resize' | null>(null);
  const [pipDragTilt, setPipDragTilt] = useState(0);
  const pipContainerRef = useRef<HTMLDivElement>(null);
  const playerBarRef = useRef<HTMLDivElement>(null);
  const pointerInteractionRef = useRef<PipPointerInteraction | null>(null);
  const pointerFrameRef = useRef<number | null>(null);
  const pendingPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const cleanupPointerInteractionRef = useRef<(() => void) | null>(null);

  const getPipBottomBoundary = () => {
    const playerBarTop = playerBarRef.current?.getBoundingClientRect().top;
    if (typeof playerBarTop === 'number' && Number.isFinite(playerBarTop)) {
      return Math.min(window.innerHeight, playerBarTop) - PIP_VIEWPORT_MARGIN;
    }
    return window.innerHeight - PLAYER_BAR_FALLBACK_HEIGHT - PIP_VIEWPORT_MARGIN;
  };

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

  // Fullscreen the video itself so the browser's playback and exit controls remain available.
  const handleToggleFullscreen = async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      if (video.requestFullscreen) {
        await video.requestFullscreen();
        return;
      }

      const mobileVideo = video as HTMLVideoElement & {
        webkitEnterFullscreen?: () => void;
      };
      mobileVideo.webkitEnterFullscreen?.();
    } catch (err) {
      console.warn('Fullscreen error:', err);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(document.fullscreenElement === videoRef.current);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Keep the floating player reachable when the browser window is resized.
  useEffect(() => {
    if (!isVideoVisible || !currentTrack || isFullscreen) return;

    let frameId: number | null = null;
    const constrainToViewport = () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        const container = pipContainerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const chromeHeight = getPipChromeHeight(container);
        const bottomBoundary = getPipBottomBoundary();
        const widthAvailable = Math.max(1, window.innerWidth - PIP_VIEWPORT_MARGIN * 2);
        const heightAvailableAsWidth = Math.max(
          1,
          (bottomBoundary - PIP_VIEWPORT_MARGIN - chromeHeight) * PIP_VIDEO_ASPECT_RATIO
        );
        const maximumWidth = Math.min(PIP_MAX_WIDTH, widthAvailable, heightAvailableAsWidth);
        const minimumWidth = Math.min(PIP_MIN_WIDTH, maximumWidth);

        setPipLayout((previous) => {
          const width = clamp(previous.width, minimumWidth, maximumWidth);
          const expectedHeight = chromeHeight + width / PIP_VIDEO_ASPECT_RATIO;
          const corner =
            previous.corner ??
            getNearestPipCorner(
              previous.x ?? rect.left,
              previous.y ?? rect.top,
              width,
              expectedHeight,
              window.innerWidth,
              bottomBoundary
            );
          const { x, y } = getPipCornerPosition(
            corner,
            width,
            expectedHeight,
            window.innerWidth,
            bottomBoundary
          );

          if (
            width === previous.width &&
            x === previous.x &&
            y === previous.y &&
            corner === previous.corner
          ) {
            return previous;
          }
          return { x, y, width, corner };
        });
      });
    };

    constrainToViewport();
    window.addEventListener('resize', constrainToViewport);
    return () => {
      window.removeEventListener('resize', constrainToViewport);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [currentTrack, isFullscreen, isVideoVisible]);

  // Debounce persistence so pointer movement never waits on localStorage writes.
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        window.localStorage.setItem(PIP_LAYOUT_STORAGE_KEY, JSON.stringify(pipLayout));
      } catch {
        // The player remains fully usable if storage is disabled.
      }
    }, 150);
    return () => window.clearTimeout(timeoutId);
  }, [pipLayout]);

  useEffect(() => {
    return () => cleanupPointerInteractionRef.current?.();
  }, []);

  const beginPipInteraction = (
    kind: PipPointerInteraction['kind'],
    event: React.PointerEvent<HTMLElement>
  ) => {
    if (event.button !== 0 || isFullscreen || !pipContainerRef.current) return;
    if (kind === 'drag' && (event.target as HTMLElement).closest('button')) return;

    event.preventDefault();
    event.stopPropagation();
    cleanupPointerInteractionRef.current?.();

    const rect = pipContainerRef.current.getBoundingClientRect();
    pointerInteractionRef.current = {
      kind,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      startWidth: rect.width,
      startHeight: rect.height,
      startRight: rect.right,
      startBottom: rect.bottom,
    };

    // Convert the default bottom/right placement to explicit coordinates before moving it.
    setPipLayout({ x: rect.left, y: rect.top, width: rect.width, corner: null });
    setPipInteraction(kind);

    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = kind === 'drag' ? 'grabbing' : 'nwse-resize';

    const applyPointerPosition = (clientX: number, clientY: number) => {
      const interaction = pointerInteractionRef.current;
      if (!interaction) return;

      const deltaX = clientX - interaction.startClientX;
      const deltaY = clientY - interaction.startClientY;

      if (interaction.kind === 'drag') {
        const bottomBoundary = getPipBottomBoundary();
        const maximumX = Math.max(
          PIP_VIEWPORT_MARGIN,
          window.innerWidth - interaction.startWidth - PIP_VIEWPORT_MARGIN
        );
        const maximumY = Math.max(
          PIP_VIEWPORT_MARGIN,
          bottomBoundary - interaction.startHeight
        );
        setPipDragTilt(clamp(deltaX * 0.008, -0.45, 0.45));
        setPipLayout((previous) => ({
          ...previous,
          x: clamp(interaction.startLeft + deltaX, PIP_VIEWPORT_MARGIN, maximumX),
          y: clamp(interaction.startTop + deltaY, PIP_VIEWPORT_MARGIN, maximumY),
          corner: null,
        }));
        return;
      }

      const container = pipContainerRef.current;
      if (!container) return;
      const chromeHeight = getPipChromeHeight(container);
      const anchoredRight = Math.min(
        interaction.startRight,
        window.innerWidth - PIP_VIEWPORT_MARGIN
      );
      const anchoredBottom = Math.min(interaction.startBottom, getPipBottomBoundary());
      const widthAvailable = Math.max(1, anchoredRight - PIP_VIEWPORT_MARGIN);
      const heightAvailableAsWidth = Math.max(
        1,
        (anchoredBottom - PIP_VIEWPORT_MARGIN - chromeHeight) * PIP_VIDEO_ASPECT_RATIO
      );
      const maximumWidth = Math.min(PIP_MAX_WIDTH, widthAvailable, heightAvailableAsWidth);
      const minimumWidth = Math.min(PIP_MIN_WIDTH, maximumWidth);
      const horizontalWidthDelta = -deltaX;
      const verticalWidthDelta = -deltaY * PIP_VIDEO_ASPECT_RATIO;
      const resizeDelta =
        Math.abs(horizontalWidthDelta) >= Math.abs(verticalWidthDelta)
          ? horizontalWidthDelta
          : verticalWidthDelta;
      const width = clamp(interaction.startWidth + resizeDelta, minimumWidth, maximumWidth);
      const height = chromeHeight + width / PIP_VIDEO_ASPECT_RATIO;

      setPipLayout({
        x: anchoredRight - width,
        y: anchoredBottom - height,
        width,
        corner: null,
      });
    };

    const handlePointerMove = (pointerEvent: PointerEvent) => {
      const interaction = pointerInteractionRef.current;
      if (!interaction || pointerEvent.pointerId !== interaction.pointerId) return;
      pointerEvent.preventDefault();
      pendingPointerRef.current = {
        clientX: pointerEvent.clientX,
        clientY: pointerEvent.clientY,
      };

      if (pointerFrameRef.current === null) {
        pointerFrameRef.current = window.requestAnimationFrame(() => {
          pointerFrameRef.current = null;
          const pendingPointer = pendingPointerRef.current;
          if (pendingPointer) {
            applyPointerPosition(pendingPointer.clientX, pendingPointer.clientY);
          }
        });
      }
    };

    const finishPointerInteraction = (pointerEvent?: PointerEvent) => {
      const interaction = pointerInteractionRef.current;
      if (
        pointerEvent &&
        interaction &&
        pointerEvent.pointerId !== interaction.pointerId
      ) {
        return;
      }

      if (pointerFrameRef.current !== null) {
        window.cancelAnimationFrame(pointerFrameRef.current);
        pointerFrameRef.current = null;
      }
      if (pendingPointerRef.current) {
        applyPointerPosition(
          pendingPointerRef.current.clientX,
          pendingPointerRef.current.clientY
        );
      }

      pendingPointerRef.current = null;
      pointerInteractionRef.current = null;
      setPipLayout((previous) => {
        const container = pipContainerRef.current;
        if (!container) return previous;

        const rect = container.getBoundingClientRect();
        const chromeHeight = getPipChromeHeight(container);
        const height = chromeHeight + previous.width / PIP_VIDEO_ASPECT_RATIO;
        const bottomBoundary = getPipBottomBoundary();
        const corner = getNearestPipCorner(
          previous.x ?? rect.left,
          previous.y ?? rect.top,
          previous.width,
          height,
          window.innerWidth,
          bottomBoundary
        );
        const { x, y } = getPipCornerPosition(
          corner,
          previous.width,
          height,
          window.innerWidth,
          bottomBoundary
        );
        return { ...previous, x, y, corner };
      });
      setPipInteraction(null);
      setPipDragTilt(0);
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishPointerInteraction);
      window.removeEventListener('pointercancel', finishPointerInteraction);
      cleanupPointerInteractionRef.current = null;
    };

    cleanupPointerInteractionRef.current = () => finishPointerInteraction();
    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', finishPointerInteraction);
    window.addEventListener('pointercancel', finishPointerInteraction);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <>
      {/*
        SINGLE <video> Element Architecture:
        The video tag is ALWAYS mounted in this container.
        When isVideoVisible is false: invisibly parked at its saved position.
        When isVideoVisible is true: displayed in a floating Picture-in-Picture window.
        This provides 0ms buffering, 0 desync, and uninterrupted audio playback.
      */}
      <div
        ref={pipContainerRef}
        className={
          isVideoVisible && currentTrack
            ? `fixed z-50 rounded-xl overflow-hidden shadow-2xl border bg-neutral-950/95 backdrop-blur-md animate-in fade-in flex flex-col ${
                pipInteraction
                  ? 'border-emerald-500/70 ring-2 ring-emerald-500/20'
                  : 'border-neutral-700/90'
              }`
            : currentTrack
              ? 'fixed z-50 rounded-xl overflow-hidden opacity-0 invisible pointer-events-none flex flex-col'
              : 'fixed -top-[9999px] -left-[9999px] w-1 h-1 opacity-0 invisible pointer-events-none overflow-hidden'
        }
        style={
          currentTrack && !isFullscreen
            ? {
                left: pipLayout.x ?? undefined,
                top: pipLayout.y ?? undefined,
                right: pipLayout.x === null ? PIP_VIEWPORT_MARGIN : undefined,
                bottom:
                  pipLayout.y === null
                    ? PLAYER_BAR_FALLBACK_HEIGHT + PIP_VIEWPORT_MARGIN
                    : undefined,
                width: pipLayout.width,
                transform:
                  pipInteraction === 'drag'
                    ? `translateY(-3px) scale(1.018) rotate(${pipDragTilt}deg)`
                    : pipInteraction === 'resize'
                      ? 'scale(1.005)'
                      : 'translateY(0) scale(1) rotate(0deg)',
                transformOrigin: pipInteraction === 'resize' ? 'bottom right' : 'center',
                boxShadow:
                  pipInteraction === 'drag'
                    ? '0 30px 70px -22px rgba(0, 0, 0, 0.9)'
                    : '0 24px 50px -18px rgba(0, 0, 0, 0.75)',
                transition: pipInteraction
                  ? 'transform 120ms ease-out, box-shadow 160ms ease-out'
                  : 'left 440ms cubic-bezier(0.34, 1.56, 0.64, 1), top 440ms cubic-bezier(0.34, 1.56, 0.64, 1), width 280ms cubic-bezier(0.34, 1.56, 0.64, 1), transform 440ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 200ms ease-out',
                willChange: 'left, top, width, transform',
              }
            : undefined
        }
        aria-hidden={!isVideoVisible}
      >
        {isVideoVisible && currentTrack && !isFullscreen && (
          <button
            type="button"
            onPointerDown={(event) => beginPipInteraction('resize', event)}
            className="group absolute left-0 top-0 z-30 h-9 w-9 cursor-nwse-resize touch-none rounded-br-xl bg-gradient-to-br from-neutral-950/95 via-neutral-950/60 to-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400"
            title={`Resize video player (${PIP_MIN_WIDTH}–${PIP_MAX_WIDTH}px wide)`}
            aria-label={`Resize video player from the top-left corner. Minimum width ${PIP_MIN_WIDTH} pixels, maximum width ${PIP_MAX_WIDTH} pixels.`}
          >
            <span className="absolute left-2 top-2 block h-3 w-3 border-l-2 border-t-2 border-neutral-400 transition-colors group-hover:border-emerald-400" />
          </button>
        )}

        {/* Floating PiP Header */}
        {isVideoVisible && currentTrack && (
          <div
            onPointerDown={(event) => beginPipInteraction('drag', event)}
            className={`flex items-center justify-between py-2 pl-10 pr-3 bg-neutral-900/90 border-b border-neutral-800 text-xs text-neutral-300 select-none touch-none ${
              isFullscreen
                ? 'cursor-default'
                : pipInteraction === 'drag'
                  ? 'cursor-grabbing'
                  : 'cursor-grab'
            }`}
            title={isFullscreen ? undefined : 'Drag to move the video player'}
          >
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
            controls={isVideoVisible}
            playsInline
            crossOrigin="anonymous"
            className="w-full h-full object-contain"
            aria-label={`${currentTrack?.animeTitle || 'Current track'} video player`}
          />

          {!isFullscreen && (
            <>
              {pipInteraction === 'resize' && (
                <div className="absolute bottom-2 right-7 z-20 rounded-md border border-neutral-700/80 bg-neutral-950/85 px-2 py-1 text-[10px] font-mono text-neutral-200 shadow-lg pointer-events-none">
                  {Math.round(pipLayout.width)} × {Math.round(pipLayout.width / PIP_VIDEO_ASPECT_RATIO)}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/*
        Persistent Spotify-Style Fixed Bottom Mini-Player Bar
        Rendered whenever a track is selected/loaded
      */}
      {currentTrack && (
        <div
          ref={playerBarRef}
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
