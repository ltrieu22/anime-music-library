import React, { createContext, useContext, useEffect, useState } from 'react';

interface UndoOffer { id: string; message: string; restore: () => void; expires: number; paused: boolean; error: string }
const Context = createContext<{
  offers: UndoOffer[]; offer: (message: string, restore: () => void) => void;
  dismiss: (id: string) => void; pause: (id: string, paused: boolean) => void; undo: (id: string) => void;
  clear: () => void;
} | null>(null);

export function RemovalUndoProvider({ children }: { children: React.ReactNode }) {
  const inherited = useContext(Context);
  return inherited ? <>{children}</> : <RemovalUndoStateProvider>{children}</RemovalUndoStateProvider>;
}

function RemovalUndoStateProvider({ children }: { children: React.ReactNode }) {
  const [offers, setOffers] = useState<UndoOffer[]>([]);
  const dismiss = (id: string) => setOffers(all => all.filter(offer => offer.id !== id));
  useEffect(() => {
    const timer = window.setInterval(() => setOffers(all => {
      const next = all.filter(offer => offer.paused || offer.error || offer.expires > Date.now());
      return next.length === all.length ? all : next;
    }), 250);
    return () => window.clearInterval(timer);
  }, []);
  return <Context.Provider value={{ offers, dismiss, clear: () => setOffers([]),
    offer: (message, restore) => setOffers([{ id: crypto.randomUUID(), message, restore, expires: Date.now() + 5000, paused: false, error: '' }]),
    pause: (id, paused) => setOffers(all => all.map(offer => offer.id === id ? { ...offer, paused, expires: Date.now() + 5000 } : offer)),
    undo: id => {
      const offer = offers.find(offer => offer.id === id);
      if (!offer) return;
      try { offer.restore(); dismiss(id); }
      catch (cause) { setOffers(all => all.map(item => item.id === id ? { ...item, error: cause instanceof Error ? cause.message : 'Could not undo. Please retry.' } : item)); }
    },
  }}>{children}</Context.Provider>;
}
export function useRemovalUndo() {
  const context = useContext(Context);
  if (!context) throw new Error('RemovalUndoProvider is required');
  return context;
}
export function RemovalUndoNotices({ inline = false }: { inline?: boolean }) {
  const { offers, undo, dismiss, pause } = useRemovalUndo();
  const act = (target: HTMLButtonElement, action: () => void) => {
    action();
    window.requestAnimationFrame(() => {
      if (target.isConnected) return;
      const fallback = document.querySelector<HTMLElement>('dialog[open] button')
        ?? document.querySelector<HTMLElement>('#playback-queue button')
        ?? document.getElementById('collection-library-heading') ?? document.getElementById('search-input');
      fallback?.focus({ preventScroll: true });
    });
  };
  return <div aria-label="Removal notifications" data-removal-notices={inline ? 'inline' : 'floating'} className={inline ? 'my-3 space-y-2' : 'fixed right-4 top-20 z-[80] max-h-[50dvh] w-[calc(100%-2rem)] max-w-sm space-y-2 overflow-y-auto'}>
    {offers.map(offer => <div key={offer.id} onMouseEnter={() => pause(offer.id, true)} onMouseLeave={event => { if (!event.currentTarget.contains(document.activeElement)) pause(offer.id, false); }}
      onFocus={() => pause(offer.id, true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) pause(offer.id, false); }}
      className="rounded-xl border border-neutral-600 bg-neutral-900 p-3 text-sm text-neutral-100 shadow-xl">
      <p role="status" className="break-words">{offer.message}</p>
      {offer.error && <p role="alert" className="mt-2 text-rose-300">{offer.error}</p>}
      <div className="mt-1 flex gap-2">
        <button onClick={event => act(event.currentTarget, () => undo(offer.id))} className="min-h-11 cursor-pointer rounded-lg px-3 font-semibold text-emerald-300 transition-colors hover:bg-emerald-400/15 hover:text-emerald-200 focus-visible:outline-2 focus-visible:outline-emerald-300">{offer.error ? 'Retry Undo' : 'Undo'}</button>
        <button onClick={event => act(event.currentTarget, () => dismiss(offer.id))} className="min-h-11 cursor-pointer rounded-lg px-3 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-300">Dismiss</button>
      </div>
    </div>)}
  </div>;
}
