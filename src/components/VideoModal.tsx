import React from 'react';
import { X, ExternalLink, Play, Music, Video } from 'lucide-react';
import { AnimeSongItem } from '../types';
import { getAniListAnimeUrl } from '../utils/anilist';
import { ThemeBadge } from './ThemeBadge';

interface VideoModalProps {
  isOpen: boolean;
  song: AnimeSongItem | null;
  onClose: () => void;
}

export const VideoModal: React.FC<VideoModalProps> = ({
  isOpen,
  song,
  onClose,
}) => {
  const mediaUrl = song?.video_url || song?.audio_url;
  if (!isOpen || !song || !mediaUrl) return null;

  const isAudioOnly = mediaUrl.endsWith('.mp3') || (!mediaUrl.endsWith('.webm') && !mediaUrl.endsWith('.mp4'));

  return (
    <div
      id="video-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-3xl bg-[#1e2022] border border-neutral-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-800 bg-neutral-900/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center text-emerald-400 flex-shrink-0">
              {isAudioOnly ? (
                <Music className="w-4 h-4 text-emerald-400" />
              ) : (
                <Play className="w-4 h-4 fill-emerald-400 text-emerald-400" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-neutral-100 truncate">
                {song.song_name}
              </h3>
              <p className="text-sm font-medium text-neutral-300 truncate">
                {song.artist}
              </p>
              <p className="text-xs text-neutral-400 truncate mt-0.5">
                <a
                  href={getAniListAnimeUrl(song.anime_name, song.anilist_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-dotted decoration-neutral-600 transition-colors hover:text-emerald-300 hover:decoration-emerald-400"
                  title="View on AniList"
                >
                  {song.anime_name}
                </a>{' '}
                ({song.anime_vintage || song.anime_year}){' '}
                {song.theme_type && (
                  <ThemeBadge themeType={song.theme_type} size="inherit" />
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={mediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors text-xs flex items-center gap-1 cursor-pointer"
              title="Open media in new tab"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Media Player */}
        <div className="relative bg-black flex items-center justify-center min-h-[220px]">
          {isAudioOnly ? (
            <div className="w-full p-8 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-neutral-900 to-black">
              <div className="w-20 h-20 rounded-full bg-emerald-950/80 border border-emerald-800/80 flex items-center justify-center text-emerald-400 shadow-lg">
                <Music className="w-10 h-10 animate-pulse" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-neutral-200">{song.song_name}</p>
                <p className="text-xs text-neutral-400 mt-0.5">{song.artist}</p>
              </div>
              <audio
                src={mediaUrl}
                controls
                autoPlay
                className="w-full max-w-md mt-2 accent-emerald-500"
              >
                Your browser does not support the audio tag.
              </audio>
            </div>
          ) : (
            <div className="w-full aspect-video">
              <video
                src={mediaUrl}
                controls
                autoPlay
                className="w-full h-full object-contain"
              >
                Your browser does not support the video tag.
              </video>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
