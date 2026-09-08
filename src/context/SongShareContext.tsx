import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { shareSongLink, songShareUrl, type ShareIdentity } from '../services/songSharing';

const SongShareContext = createContext<(song: ShareIdentity) => void>(() => {});
export const useSongShare = () => useContext(SongShareContext);

function ShareDialog({ url, onClose }: { url: string | null; onClose: () => void }) {
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
    const result = await shareSongLink(url, navigator, copyOnly);
    pending.current = false;
    setBusy(false);
    setMessage(result === 'copied' ? 'Link copied.' : result === 'shared' ? 'Song shared.'
      : result === 'cancelled' ? 'Sharing cancelled.' : 'Could not copy automatically. Select the link below and copy it.');
    if (result === 'manual') { input.current?.focus(); input.current?.select(); }
  };
  return <dialog ref={ref} onCancel={(event) => { event.preventDefault(); onClose(); }}
    aria-labelledby="share-song-title" className="m-auto w-[min(92vw,30rem)] rounded-xl border border-neutral-700 bg-neutral-900 p-5 text-neutral-100 shadow-2xl backdrop:bg-black/60">
    <h2 id="share-song-title" className="text-lg font-semibold">Share song</h2>
    {url ? <>
      <p className="my-3 text-sm text-neutral-300">Anyone with this link can open the song without an account.</p>
      <label className="text-sm">Song link<input ref={input} readOnly value={url} onFocus={event => event.target.select()}
        className="mt-1 w-full rounded border border-neutral-600 bg-neutral-950 p-2 text-sm" /></label>
      <p role="status" className="my-3 text-sm text-emerald-300">{message}</p>
      <div className="flex flex-wrap gap-2">
        {typeof navigator.share === 'function' && <button disabled={busy} onClick={() => void send(false)} className="rounded bg-emerald-700 px-3 py-2 disabled:opacity-50">Share</button>}
        <button disabled={busy} onClick={() => void send(true)} className="rounded bg-neutral-700 px-3 py-2 disabled:opacity-50">Copy link</button>
      </div>
    </> : <p className="my-3 text-sm text-neutral-300">This custom song has no public catalog link. Only songs with a public catalog ID can be shared.</p>}
    <button onClick={onClose} className="mt-4 rounded border border-neutral-600 px-3 py-2">Close</button>
  </dialog>;
}

export function SongShareProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<{ url: string | null } | null>(null);
  return <SongShareContext.Provider value={song => setDialog({ url: songShareUrl(song, new URL(window.location.href)) })}>
    {children}
    {dialog && <ShareDialog key={dialog.url ?? 'custom'} url={dialog.url} onClose={() => setDialog(null)} />}
  </SongShareContext.Provider>;
}
