import React from 'react';
import { Play, Pause, Shuffle, Music } from 'lucide-react';
import { SongTrack } from '../../types/player';
import { usePlayer } from '../../context/PlayerContext';

interface PlayCollectionBarProps {
  tracks: SongTrack[];
  className?: string;
}

export const PlayCollectionBar: React.FC<PlayCollectionBarProps> = ({
  tracks,
  className = '',
}) => {
  const { currentTrack, queueSource, isPlaying, playQueue, togglePlay } = usePlayer();

  const isCollectionActive =
    queueSource === 'collection' && currentTrack && tracks.some((t) => String(t.id) === String(currentTrack.id));
  const isCollectionPlaying = Boolean(isCollectionActive && isPlaying);

  const handlePlayAll = () => {
    if (tracks.length === 0) return;
    if (isCollectionActive) {
      togglePlay();
    } else {
      playQueue(tracks, 0);
    }
  };

  const handleShuffle = () => {
    if (tracks.length === 0) return;
    const shuffled = [...tracks].sort(() => Math.random() - 0.5);
    playQueue(shuffled, 0);
  };

  if (tracks.length === 0) {
    return null;
  }

  return (
    <div
      id="play-collection-bar"
      className={`flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4 rounded-xl bg-gradient-to-r from-neutral-900 via-neutral-900/90 to-neutral-850 border border-neutral-800 shadow-md ${className}`}
    >
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-emerald-950/80 border border-emerald-800/60 flex items-center justify-center text-emerald-400 flex-shrink-0">
          <Music className="w-4 h-4" />
        </div>
        <div>
          <h3 className="min-h-5 text-sm font-semibold text-neutral-100 flex items-center gap-2">
            <span>My Collection Playlist</span>
            <span
              className={`min-w-[5.75rem] flex items-center justify-center gap-1 text-[11px] font-normal text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/40 transition-opacity ${
                isCollectionPlaying ? 'visible opacity-100' : 'invisible opacity-0'
              }`}
              aria-hidden={!isCollectionPlaying}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Playing Now
            </span>
          </h3>
          <p className="text-xs text-neutral-400">
            {tracks.length} song{tracks.length === 1 ? '' : 's'} ready for persistent audio &amp; video playback
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handlePlayAll}
          className="min-w-[10.5rem] flex items-center justify-center gap-1.5 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs font-semibold text-neutral-950 bg-emerald-400 hover:bg-emerald-300 active:scale-98 shadow-sm transition-all cursor-pointer"
          title="Play entire collection"
        >
          {isCollectionPlaying ? (
            <>
              <Pause className="w-3.5 h-3.5 fill-neutral-950" />
              <span>Pause Collection</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-neutral-950 ml-0.5" />
              <span>Play Collection (Audio)</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleShuffle}
          className="flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg text-xs font-medium text-neutral-200 bg-neutral-800 hover:bg-neutral-700 hover:text-white border border-neutral-700 transition-all cursor-pointer"
          title="Shuffle and play collection"
        >
          <Shuffle className="w-3.5 h-3.5 text-neutral-300" />
          <span>Shuffle</span>
        </button>
      </div>
    </div>
  );
};
