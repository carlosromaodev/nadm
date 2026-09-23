'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ACarregar, AvisoSemSessao } from './states';
import { Botao, Pastilha, Rotulo, Vazio } from './ui';
import type { Deal } from '@/lib/api';
import { creatorDeadline } from '@/lib/creator-api';
import { estadoVisual } from '@/lib/deal-state';
import { formatMoney } from '@/lib/money';

export const creatorField = 'w-full rounded-[18px] border border-line bg-wash px-3.5 py-3 text-[13.5px] font-[700] text-ink placeholder:text-dim';
export const creatorLink = 'inline-flex min-h-11 items-center justify-center rounded-full bg-lime px-5 text-[13px] font-[1000] text-lime-ink';

export function CreatorBoundary({ ready, userId, error, loading, retry, children }: {
  ready: boolean; userId: string | null; error: string | null; loading: boolean; retry: () => void; children: ReactNode;
}) {
  if (!ready) return <ACarregar />;
  if (!userId) return <AvisoSemSessao />;
  if (error) return <Vazio titulo="Não conseguimos abrir o estúdio" texto={error} accao={<div className="flex flex-col gap-3"><Botao onClick={retry}>Tentar outra vez</Botao><Link href="/criar-perfil" className="text-[13px] font-[900] text-lime">Criar o meu perfil</Link></div>} />;
  if (loading) return <ACarregar />;
  return children;
}
export function CreatorNotice({ error, children }: { error?: boolean; children: ReactNode }) {
  return <p role={error ? 'alert' : 'status'} className={`mt-3 rounded-[18px] border border-line bg-wash p-3 text-[12px] font-[700] leading-relaxed ${error ? 'text-danger' : 'text-ink'}`}>{children}</p>;
}
export function CreatorField({ label, children, note }: { label: string; children: ReactNode; note?: string }) {
  return <label className="mt-4 block"><span className="mb-2 block"><Rotulo>{label}</Rotulo></span>{children}{note && <span className="mt-1.5 block text-[11.5px] font-[700] text-dim">{note}</span>}</label>;
}
export function CreatorSwitch({ label, note, checked, onChange }: { label: string; note?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <div className="flex items-center gap-3 py-2"><div className="min-w-0 flex-1"><p className="text-[13px] font-[900]">{label}</p>{note && <p className="mt-0.5 text-[11px] font-[700] text-dim">{note}</p>}</div><button type="button" role="switch" aria-label={label} aria-checked={checked} onClick={() => onChange(!checked)} className={`relative inline-flex h-11 w-12 shrink-0 items-center rounded-full ${checked ? 'text-lime' : 'text-dim'}`}><span className={`relative h-[26px] w-12 rounded-full ${checked ? 'bg-lime' : 'bg-surface2'}`}><span className={`absolute top-[3px] size-5 rounded-full bg-bg transition-[left] ${checked ? 'left-[25px]' : 'left-[3px]'}`} /></span></button></div>;
}
export function CreatorDealRow({ deal, compact = false }: { deal: Deal; compact?: boolean }) {
  const state = estadoVisual(deal.status, deal.escrowStatus);
  const deadline = creatorDeadline(deal);
  if (compact) return <Link href={`/deals/${deal.id}`} className="toque flex items-center gap-[11px] rounded-[20px] border border-line bg-surface px-[13px] py-3"><span className={`size-2 shrink-0 rounded-full ${state.tom === 'espera' ? 'bg-amber' : state.tom === 'mau' ? 'bg-danger' : 'bg-lime'}`} /><span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-[900]">{deal.offer.title}</span><span className="mt-0.5 block text-[11.5px] font-bold text-dim">{deal.reference}</span></span><span className="shrink-0 text-right"><span className="algarismos block text-[14.5px] font-[1000] tracking-[-.02em]">{formatMoney(deal.creatorNet)}</span><span className={`block text-[11px] font-extrabold ${state.tom === 'espera' ? 'text-amber' : 'text-dim'}`}>{deadline || state.retido}</span></span></Link>;
  return <Link href={`/deals/${deal.id}`} className="block rounded-[22px] border border-line bg-surface p-3.5 hover:bg-surface2"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-[13.5px] font-[900]">{deal.offer.title}</p><p className="mt-0.5 text-[11px] font-[700] text-dim">{deal.reference}</p></div><Pastilha tom={state.tom}>{state.etiqueta}</Pastilha></div><div className="mt-3 flex items-center justify-between gap-2"><span className="algarismos text-[16px] font-[1000]">{formatMoney(deal.creatorNet)}</span><span className="text-right text-[11px] font-[800] text-dim">{deadline || (deal.escrowStatus === 'RELEASED' ? 'na carteira' : deal.escrowStatus === 'HELD' ? 'retido na NaDM' : 'por pagar')}</span></div></Link>;
}
