'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from './icon';

export function AppSheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = dialog.current;
    node?.showModal();
    return () => { node?.close(); if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }} className="app-sheet anima-folha">
    <div className="mx-auto mb-4 h-[5px] w-11 rounded-full bg-line" />
    <div className="mb-4 flex items-center justify-between gap-3"><h2 id={titleId} className="text-[20px] font-[1000] tracking-[-.025em]">{title}</h2><button type="button" aria-label="Fechar" onClick={onClose} className="icon-button"><Icon name="close" className="size-4" /></button></div>
    {children}
  </dialog>;
}
