import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Check, Info } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { usePlayer } from './PlayerContext';
import { catalogSearchShareUrl, type CatalogUrlState } from '../services/catalogUrlState';
import { shareSongLink, songShareUrl, type ShareIdentity } from '../services/songSharing';

interface ShareDialogState { url: string | null; title: string; description: string; unavailable?: string }
interface ShareToastState { message: string; type: 'success' | 'info' }
const SongShareContext = createContext<{
  shareSong: (song: ShareIdentity) => void;
  shareSearch: (state: CatalogUrlState) => void;
}>({ shareSong: () => {}, shareSearch: () => {} });
export const useSongShare = () => useContext(SongShareContext).shareSong;
export const useSearchShare = () => useContext(SongShareContext).shareSearch;

function ShareDialog({ state, onClose }: { state: ShareDialogState; onClose: () => void }) {
  const { url, title, description, unavailable } = state;
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    return () => { dialog.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  const send = async (copyOnly: boolean) => {
    if (!url || pending.current) return;
    pending.current = true;
    setBusy(true);
    const result = await shareSongLink(url, navigator, copyOnly, title === 'Share search' ? 'Anime catalog search' : 'Anime song');
    pending.current = false;
    setBusy(false);
    setMessage(result === 'copied' ? 'Link copied.' : result === 'shared' ? (title === 'Share search' ? 'Search shared.' : 'Song shared.')
      : result === 'cancelled' ? 'Sharing cancelled.' : 'Could not copy automatically. Select the link below and copy it.');
    if (result === 'manual') { input.current?.focus(); input.current?.select(); }
  };
  return <dialog ref={ref} onCancel={(event) => { event.preventDefault(); onClose(); }}
    aria-labelledby="share-link-title" className="m-auto w-[min(92vw,30rem)] rounded-xl border border-neutral-700 bg-neutral-900 p-5 text-neutral-100 shadow-2xl backdrop:bg-black/60">
    <h2 id="share-link-title" className="text-lg font-semibold">{title}</h2>
    {url ? <>
      <p className="my-3 text-sm text-neutral-300">{description}</p>
      <label className="text-sm">Link<input ref={input} readOnly value={url} onFocus={event => event.target.select()}
        className="mt-1 w-full rounded border border-neutral-600 bg-neutral-950 p-2 text-sm" /></label>
      <p role="status" className="my-3 text-sm text-emerald-300">{message}</p>
      <div className="flex flex-wrap gap-2">
        {typeof navigator.share === 'function' && <button disabled={busy} onClick={() => void send(false)} className="rounded bg-emerald-700 px-3 py-2 disabled:opacity-50">Share</button>}
        <button disabled={busy} onClick={() => void send(true)} className="rounded bg-neutral-700 px-3 py-2 disabled:opacity-50">Copy link</button>
      </div>
    </> : <p className="my-3 text-sm text-neutral-300">{unavailable}</p>}
    <button onClick={onClose} className="mt-4 rounded border border-neutral-600 px-3 py-2">Close</button>
  </dialog>;
}

function ShareToast({ toast }: { toast: ShareToastState | null }) {
  const { currentTrack } = usePlayer();
  const reduceMotion = useReducedMotion();
  const success = toast?.type === 'success';
  return <div className={`pointer-events-none fixed inset-x-4 z-[100] flex justify-center ${currentTrack
    ? 'bottom-[calc(8rem+env(safe-area-inset-bottom))] sm:bottom-[calc(6rem+env(safe-area-inset-bottom))]'
    : 'bottom-[calc(1.5rem+env(safe-area-inset-bottom))]'}`}>
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">{toast?.message}</div>
    <AnimatePresence>
      {toast && <motion.div aria-hidden="true"
        initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reduceMotion ? 0 : 4 }}
        transition={{ duration: reduceMotion ? 0 : 0.18, ease: 'easeOut' }}
        className="flex max-w-sm items-center gap-3 rounded-xl border border-neutral-700/80 bg-[#1e2022] px-4 py-3 text-sm font-medium text-neutral-100 shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${success
          ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-400/10 text-amber-400'}`}>
          {success ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <Info className="h-4 w-4" />}
        </span>
        <span>{toast.message}</span>
      </motion.div>}
    </AnimatePresence>
  </div>;
}

export function SongShareProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<ShareDialogState | null>(null);
  const [toast, setToast] = useState<ShareToastState | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), toast.type === 'success' ? 3500 : 5500);
    return () => window.clearTimeout(timeout);
  }, [toast]);
  const copySong = async (song: ShareIdentity) => {
    const url = songShareUrl(song, new URL(window.location.href));
    if (!url) {
      setToast({ message: 'This custom song has no public catalog link.', type: 'info' });
      return;
    }
    const result = await shareSongLink(url, navigator, true);
    setToast({ message: result === 'copied' ? 'Link copied.' : 'Could not copy the link. Check clipboard permissions and try again.',
      type: result === 'copied' ? 'success' : 'info' });
  };
  const value = {
    shareSong: (song: ShareIdentity) => { void copySong(song); },
    shareSearch: (state: CatalogUrlState) => setDialog({
      url: catalogSearchShareUrl(state, new URL(window.location.href)), title: 'Share search',
      description: 'This link includes your search text and public filters. Anyone with it can restore this catalog view.',
    }),
  };
  return <SongShareContext.Provider value={value}>
    {children}
    <ShareToast toast={toast} />
    {dialog && <ShareDialog key={`${dialog.title}:${dialog.url ?? 'custom'}`} state={dialog} onClose={() => setDialog(null)} />}
  </SongShareContext.Provider>;
}
