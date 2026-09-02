import React, { useState, useEffect, useRef } from 'react';
import { AnimeDetails } from '../types';
import { fetchAnimeCoverDetails } from '../services/api';
import { Star, Tv, Calendar, Tag, Sparkles } from 'lucide-react';

interface AnimeHoverCardProps {
  animeName: string;
  anilistId?: number | null;
  children: React.ReactNode;
  className?: string;
}

// Client-side cache for instantaneous repeat hovers
const detailsCache = new Map<string, AnimeDetails | null>();

export const AnimeHoverCard: React.FC<AnimeHoverCardProps> = ({
  animeName,
  anilistId,
  children,
  className = '',
}) => {
  const cacheKey = anilistId ? `id_${anilistId}` : animeName.toLowerCase();
  const [isOpen, setIsOpen] = useState(false);
  const [details, setDetails] = useState<AnimeDetails | null>(
    detailsCache.get(cacheKey) || null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [cardPosition, setCardPosition] = useState<'top' | 'bottom'>('top');

  const containerRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    // 140ms delay before showing to prevent flicker when brushing across rows
    hoverTimeoutRef.current = setTimeout(() => {
      setIsOpen(true);

      // Check vertical position relative to viewport
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        // If near top of screen, show below; else show above
        if (rect.top < 260) {
          setCardPosition('bottom');
        } else {
          setCardPosition('top');
        }
      }

      // Fetch details if not already in cache
      const cached = detailsCache.get(cacheKey);
      if (cached) {
        setDetails(cached);
      } else {
        setIsLoading(true);
        fetchAnimeCoverDetails(animeName, anilistId)
          .then((res) => {
            detailsCache.set(cacheKey, res);
            setDetails(res);
          })
          .catch(() => {
            detailsCache.set(cacheKey, null);
          })
          .finally(() => {
            setIsLoading(false);
          });
      }
    }, 140);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsOpen(false);
  };

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative inline-block cursor-help ${className}`}
    >
      {children}

      {/* Floating Card Popover */}
      {isOpen && (
        <div
          className={`absolute left-0 z-50 w-72 sm:w-80 rounded-xl bg-[#1c1e20] border border-neutral-700/80 p-3.5 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 pointer-events-none text-left ${
            cardPosition === 'top'
              ? 'bottom-full mb-2.5'
              : 'top-full mt-2.5'
          }`}
          style={{
            boxShadow: '0 20px 30px -10px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.07)',
          }}
        >
          {isLoading && !details ? (
            <div className="flex items-center gap-3">
              <div className="w-16 h-24 rounded-lg bg-neutral-800 animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-3/4 bg-neutral-800 rounded animate-pulse" />
                <div className="h-3 w-1/2 bg-neutral-800 rounded animate-pulse" />
                <div className="h-2.5 w-2/3 bg-neutral-800/80 rounded animate-pulse" />
              </div>
            </div>
          ) : details ? (
            <div className="flex gap-3">
              {/* Cover Poster Artwork */}
              {details.coverImage ? (
                <div className="w-20 h-28 rounded-lg overflow-hidden flex-shrink-0 bg-neutral-900 border border-neutral-700/60 shadow-md relative">
                  <img
                    src={details.coverImage}
                    alt={details.anime}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                  />
                  {details.score && (
                    <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-sm text-[10px] font-bold text-emerald-400 flex items-center gap-0.5">
                      <Star className="w-2.5 h-2.5 fill-emerald-400 text-emerald-400" />
                      <span>{details.score}%</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-20 h-28 rounded-lg bg-neutral-800 border border-neutral-700/50 flex flex-col items-center justify-center text-neutral-500 flex-shrink-0">
                  <Tv className="w-6 h-6 mb-1 opacity-50" />
                  <span className="text-[10px]">No Poster</span>
                </div>
              )}

              {/* Information Column */}
              <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                <div>
                  {/* Titles */}
                  <h4 className="text-xs font-bold text-neutral-100 line-clamp-1 leading-tight">
                    {details.romaji || details.anime}
                  </h4>
                  {details.english && details.english !== details.romaji && (
                    <p className="text-[11px] text-neutral-400 line-clamp-1 mt-0.5">
                      {details.english}
                    </p>
                  )}
                  {details.native && (
                    <p className="text-[10px] text-neutral-500 font-sans mt-0.5 truncate">
                      {details.native}
                    </p>
                  )}

                  {/* Metadata Chips */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {details.format && (
                      <span className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-[10px] text-neutral-300 font-medium">
                        {details.format.replace('_', ' ')}
                      </span>
                    )}

                    {(details.season || details.year) && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-950/50 border border-emerald-800/60 text-[10px] text-emerald-300 font-medium flex items-center gap-0.5">
                        <Calendar className="w-2.5 h-2.5" />
                        <span>
                          {details.season ? `${details.season} ` : ''}
                          {details.year || ''}
                        </span>
                      </span>
                    )}

                    {details.episodes && (
                      <span className="text-[10px] text-neutral-400">
                        {details.episodes} eps
                      </span>
                    )}
                  </div>
                </div>

                {/* Genres */}
                {details.genres && details.genres.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {details.genres.slice(0, 3).map((g) => (
                      <span
                        key={g}
                        className="text-[9px] px-1.5 py-0.2 rounded bg-neutral-800/80 text-neutral-400 border border-neutral-750"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-neutral-400 py-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>{animeName}</span>
            </div>
          )}

          {/* Little arrow indicator */}
          <div
            className={`absolute left-6 w-2.5 h-2.5 bg-[#1c1e20] border-neutral-700/80 transform rotate-45 ${
              cardPosition === 'top'
                ? '-bottom-1.5 border-b border-r'
                : '-top-1.5 border-t border-l'
            }`}
          />
        </div>
      )}
    </div>
  );
};
