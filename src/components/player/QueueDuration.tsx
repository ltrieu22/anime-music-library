import { useEffect, useRef, useState } from 'react';
import { resolveVideoUrl } from '../../context/PlayerContext';

const durations = new Map<string, number>();

/** Only probe visible rows; release the metadata-only media element promptly. */
export function QueueDuration({ videoUrl, duration }: { videoUrl: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const url = resolveVideoUrl(videoUrl);
  const [loaded, setLoaded] = useState<{ url: string; seconds: number } | null>(null);
  const seconds = duration || (loaded?.url === url ? loaded.seconds : durations.get(url));

  useEffect(() => {
    if (duration || durations.has(url) || !url) return;
    let media: HTMLVideoElement | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const release = () => {
      clearTimeout(timeout);
      if (!media) return;
      media.onloadedmetadata = null;
      media.onerror = null;
      media.removeAttribute('src');
      media.load();
      media = undefined;
    };
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      media = document.createElement('video');
      media.preload = 'metadata';
      media.muted = true;
      media.onloadedmetadata = () => {
        const value = media?.duration;
        if (value && Number.isFinite(value)) {
          durations.set(url, value);
          if (durations.size > 500) durations.delete(durations.keys().next().value!);
          setLoaded({ url, seconds: value });
        }
        release();
      };
      media.onerror = release;
      timeout = setTimeout(release, 15000);
      media.src = url;
    });
    if (ref.current) observer.observe(ref.current);
    return () => { observer.disconnect(); release(); };
  }, [url, duration]);

  const valid = seconds && Number.isFinite(seconds) && seconds > 0;
  const total = valid ? Math.floor(seconds) : 0;
  return <span ref={ref} className="text-xs tabular-nums text-neutral-400" aria-label={valid ? 'Track duration' : 'Duration unavailable'}>
    {valid ? `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}` : '—:—'}
  </span>;
}
