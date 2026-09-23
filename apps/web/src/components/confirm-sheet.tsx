'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Botao } from './ui';
export function ConfirmSheet({ title, children, confirmLabel, cancelLabel = 'Voltar à entrega', busy, disabled, onCancel, onConfirm }: { title: string; children: ReactNode; confirmLabel: string; cancelLabel?: string; busy?: boolean; disabled?: boolean; onCancel: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }} className="anima-folha fixed inset-x-0 top-auto bottom-0 m-auto w-full max-w-[420px] rounded-t-[30px] border border-line bg-bg p-5 pb-[max(20px,env(safe-area-inset-bottom))] text-ink backdrop:bg-black/65">
    <h2 id={titleId} className="text-xl font-black">{title}</h2><div className="my-4 text-sm leading-relaxed text-dim">{children}</div><Botao bloco onClick={onConfirm} disabled={busy || disabled}>{busy ? 'A confirmar…' : confirmLabel}</Botao><Botao bloco variante="secundario" className="mt-3" onClick={onCancel} disabled={busy} autoFocus>{cancelLabel}</Botao>
  </dialog>;
}
