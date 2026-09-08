import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { fetchAnimeCoverUrl } from '../../services/api';
import { getCachedCover } from '../../services/coverCache';
import type { SongTrack } from '../../types/player';

export function QueueCover({ track }: { track: SongTrack }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cover, setCover] = useState<string | null>(() => track.image || getCachedCover(track.animeTitle, track.anilistId));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const cached = track.image || getCachedCover(track.animeTitle, track.anilistId);
    setCover(cached);
    setFailed(false);
    if (cached) return;

    const load = () => {
      fetchAnimeCoverUrl(track.animeTitle, track.anilistId)
        .then(url => { if (active) setCover(url); })
        .catch(() => {});
    };
    // Fetch covers as rows approach the visible part of a long queue.
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        observer.disconnect();
        load();
      }
    }, { rootMargin: '100px' });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => { active = false; observer.disconnect(); };
  }, [track.animeTitle, track.anilistId, track.image]);

  return (
    <div ref={containerRef} aria-hidden="true" className="flex h-20 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-neutral-700 bg-neutral-800">
      {cover && !failed ? (
        <img draggable={false} src={cover} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : <ImageIcon className="h-5 w-5 text-neutral-500" />}
    </div>
  );
}

