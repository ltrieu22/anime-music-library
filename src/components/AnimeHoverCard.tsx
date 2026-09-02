import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AnimeDetails } from '../types';
import { fetchAnimeCoverDetails } from '../services/api';
import { Star, Image as ImageIcon } from 'lucide-react';

interface AnimeHoverCardProps {
  animeName: string;
  anilistId?: number | null;
  children: React.ReactNode;
  className?: string;
}

interface PositionCoords {
  top?: number;
  bottom?: number;
  left: number;
  position: 'top' | 'bottom';
}

// Client cache to avoid repeat network requests
const detailsCache = new Map<string, AnimeDetails | null>();

export const AnimeHoverCard: React.FC<AnimeHoverCardProps> = ({
  animeName,
  anilistId,
  children,
  className = '',
}) => {
  const cacheKey = anilistId ? `id_${anilistId}` : animeName.toLowerCase().trim();
  const [isOpen, setIsOpen] = useState(false);
  const [details, setDetails] = useState<AnimeDetails | null>(
    detailsCache.get(cacheKey) || null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [coords, setCoords] = useState<PositionCoords | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const calculatePosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cardWidth = 220; // compact, focused cover image card width
    const cardHeight = 290; // estimated height of the card

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    // Determine vertical position:
    // If rect.top is near the top of the viewport (< 280px) or space below is larger, place BELOW
    const placeBelow = spaceAbove < 280 || spaceBelow >= cardHeight;

    // Horizontal positioning: align with trigger left, clamped within viewport bounds
    let left = rect.left;
    if (left + cardWidth > window.innerWidth - 16) {
      left = window.innerWidth - cardWidth - 16;
    }
    if (left < 16) {
      left = 16;
    }

    if (placeBelow) {
      setCoords({
        top: Math.max(8, rect.bottom + 8),
        left,
        position: 'bottom',
      });
    } else {
      setCoords({
        bottom: Math.max(8, window.innerHeight - rect.top + 8),
        left,
        position: 'top',
      });
    }
  }, []);

  const handleMouseEnter = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      calculatePosition();
      setIsOpen(true);

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
    }, 80);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsOpen(false);
  };

  useEffect(() => {
    if (!isOpen) return;
    const onScrollOrResize = () => calculatePosition();
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [isOpen, calculatePosition]);

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
      className={`inline-block ${className}`}
    >
      {children}

      {/* Rendered directly into document.body to stay strictly on top of everything without overflow clipping */}
      {isOpen &&
        coords &&
        createPortal(
          <div
            className="fixed z-[999999] pointer-events-none rounded-xl bg-[#1c1e20] border border-neutral-700 p-2.5 shadow-2xl transition-all duration-150 text-left"
            style={{
              ...(coords.top !== undefined ? { top: `${coords.top}px` } : {}),
              ...(coords.bottom !== undefined ? { bottom: `${coords.bottom}px` } : {}),
              left: `${coords.left}px`,
              width: '220px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.08)',
            }}
          >
            {/* Cover Poster Image */}
            <div className="w-full h-64 rounded-lg overflow-hidden bg-neutral-900 border border-neutral-700/60 relative flex items-center justify-center">
              {isLoading && !details ? (
                <div className="w-full h-full bg-neutral-800 animate-pulse" />
              ) : details?.coverImage ? (
                <>
                  <img
                    src={details.coverImage}
                    alt={details.anime || animeName}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    loading="eager"
                  />
                  {details.score && (
                    <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-black/80 backdrop-blur-sm text-[11px] font-bold text-emerald-400 flex items-center gap-1 border border-neutral-700/50 shadow">
                      <Star className="w-3 h-3 fill-emerald-400 text-emerald-400" />
                      <span>{details.score}%</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center text-neutral-500 gap-1.5 p-4 text-center">
                  <ImageIcon className="w-8 h-8 opacity-40" />
                  <span className="text-xs">No Cover Image</span>
                </div>
              )}
            </div>

            {/* Anime Title & Vintage */}
            <div className="pt-2 px-0.5">
              <h4 className="text-xs font-bold text-neutral-100 line-clamp-1 leading-snug">
                {details?.romaji || details?.anime || animeName}
              </h4>
              {details?.english && details.english !== (details.romaji || details.anime) && (
                <p className="text-[11px] text-neutral-400 line-clamp-1 mt-0.5">
                  {details.english}
                </p>
              )}
              {details?.year && (
                <p className="text-[10px] text-emerald-400 font-semibold mt-0.5">
                  {details.year}
                </p>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
