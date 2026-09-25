'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Flor } from './flor';
import { Icon } from './icon';
import { Botao, Pastilha } from './ui';
import type { Deal } from '@/lib/api';
import { estadoVisual } from '@/lib/deal-state';
import { formatMoney } from '@/lib/money';
import type { ViewerProfile } from '@/lib/viewer-data';

export function LinkAction({ href, children, secondary = false, className = '' }: {
  href: string; children: ReactNode; secondary?: boolean; className?: string;
}) {
  return <Link href={href} className={`toque inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-center text-[14px] font-[1000] ${secondary ? 'border border-line text-ink' : 'bg-lime text-lime-ink'} ${className}`}>{children}</Link>;
}

export function LoadError({ message, retry, title = 'Não foi possível carregar' }: {
  message: string; retry?: () => void; title?: string;
}) {
  return <div role="alert" className="flex flex-col items-center gap-3 px-3 py-10 text-center">
    <Flor className="size-12 opacity-35" /><h2 className="text-[18px] font-[1000]">{title}</h2>
    <p className="max-w-[30ch] text-[13px] font-[700] leading-relaxed text-dim">{message}</p>
    {retry && <Botao onClick={retry} variante="secundario" className="mt-1 h-11">Tentar novamente</Botao>}
  </div>;
}

export function Avatar({ name, url, large = false }: { name: string; url?: string | null; large?: boolean }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toLocaleUpperCase('pt');
  return <span aria-hidden="true" className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-surface2 font-[1000] text-lime-text ${large ? 'size-[82px] text-[26px]' : 'size-[48px] text-[17px]'}`}>
    {url ? <img src={url} alt="" className="size-full object-cover" /> : initials || 'N'}
  </span>;
}

export function ProfileCard({ profile }: { profile: ViewerProfile }) {
  const cheapest = profile.offers.reduce<ViewerProfile['offers'][number] | undefined>((previous, offer) =>
    !previous || BigInt(offer.price.amount) < BigInt(previous.price.amount) ? offer : previous, undefined);
  return <Link href={`/${profile.handle}`} className="flex items-center gap-3 rounded-[24px] border border-line bg-surface p-[13px] hover:bg-surface2">
    <span className="relative"><Avatar name={profile.displayName} url={profile.avatarUrl} /><span className={`absolute right-0 bottom-0 size-3 rounded-full border-2 border-surface ${profile.availabilityStatus === 'AVAILABLE' ? 'bg-lime' : 'bg-amber'}`} /></span>
    <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-[900]">{profile.displayName}</span><span className="mt-0.5 block truncate text-[11.5px] font-[700] text-dim">{[profile.category, profile.location].filter(Boolean).join(' · ') || `@${profile.handle}`}</span><span className="mt-1.5 block text-[10.5px] font-[800] text-dim">{profile.availabilityStatus === 'AVAILABLE' ? 'A aceitar pedidos' : profile.availabilityStatus === 'PAUSED' ? 'Em pausa' : 'Sem vagas'}</span></span>
    {cheapest && <span className="shrink-0 text-right"><span className="block text-[9px] font-[800] uppercase tracking-wider text-dim">desde</span><span className="algarismos text-[14px] font-[1000]">{formatMoney(cheapest.price)}</span></span>}
  </Link>;
}

export function DealRow({ deal }: { deal: Deal }) {
  const state = estadoVisual(deal.status, deal.escrowStatus);
  return <Link href={`/deals/${deal.id}`} className="block rounded-[20px] border border-line bg-surface p-[13px] hover:bg-surface2">
    <span className="flex items-start justify-between gap-2"><span className="min-w-0"><span className="block truncate text-[13.5px] font-[900]">{deal.offer.title}</span><span className="algarismos mt-0.5 block text-[11.5px] font-[700] text-dim">{deal.reference}</span></span><Pastilha tom={state.tom}>{state.etiqueta}</Pastilha></span>
    <span className="mt-2.5 flex items-baseline justify-between gap-2"><span className="algarismos text-[16px] font-[1000]">{formatMoney(deal.amount)}</span><span className="text-[11px] font-[800] text-dim">{state.retido}</span></span>
  </Link>;
}

export function Chip({ selected, children, onClick }: { selected: boolean; children: ReactNode; onClick: () => void }) {
  return <button type="button" aria-pressed={selected} onClick={onClick} className={`h-[34px] shrink-0 rounded-full px-[13px] text-[12px] ${selected ? 'bg-lime font-[900] text-lime-ink' : 'border border-line font-extrabold text-dim'}`}>{children}</button>;
}

export function BellLink() {
  return <Link href="/notificacoes" aria-label="Notificações" className="icon-button"><Icon name="bell" className="size-[17px]" /></Link>;
}
