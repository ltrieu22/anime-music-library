import React, { useLayoutEffect, useRef } from 'react';

interface ModalDialogProps {
  isOpen: boolean;
  onClose: () => void;
  labelledBy: string;
  describedBy?: string;
  initialFocus?: string;
  busy?: boolean;
  className?: string;
  children: React.ReactNode;
}

/** Native modal semantics and inert background, with shared keyboard/focus behavior. */
export function ModalDialog({ isOpen, onClose, labelledBy, describedBy, initialFocus, busy = false, className = '', children }: ModalDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const initialFocusRef = useRef(initialFocus);
  initialFocusRef.current = initialFocus;

  useLayoutEffect(() => {
    if (!isOpen) return;
    const dialog = ref.current!;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    if (initialFocusRef.current) dialog.querySelector<HTMLElement>(initialFocusRef.current)?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected && !previous.matches(':disabled')) previous.focus({ preventScroll: true });
      else (document.getElementById('search-input') ?? document.getElementById('header-add-song-btn'))?.focus({ preventScroll: true });
    };
  }, [isOpen]);

  if (!isOpen) return null;
  const requestClose = () => { if (!busy) onClose(); };
  return <dialog ref={ref} tabIndex={-1} aria-labelledby={labelledBy} aria-describedby={describedBy} aria-modal="true" aria-busy={busy}
    onCancel={event => { event.preventDefault(); requestClose(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) requestClose();
    }}
    onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
        'a[href], button, input, select, textarea, [tabindex]',
      )).filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); ref.current?.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) {
        event.preventDefault(); first.focus();
      }
    }}
    className={`m-auto w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-neutral-800 bg-[#1e2022] p-0 text-neutral-100 shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-xs ${className}`}>
    {children}
  </dialog>;
}
