'use client';

import Link from 'next/link';
import { Flor } from '@/components/flor';
import { Icon, type IconName } from '@/components/icon';
import { Screen } from '@/components/screen';
import { StudioHeader } from '@/components/studio-nav';
import { CreatorBoundary, CreatorDealRow } from '@/components/creator-ui';
import { BellLink } from '@/components/viewer-ui';
import { Rotulo } from '@/components/ui';
import { creatorMoney, hasCreatorAction, useCreatorData } from '@/lib/creator-api';
import { formatMoney } from '@/lib/money';

export default function PainelPage() {
  const state = useCreatorData();
  const { data } = state;
  const queue = data?.deals.filter(hasCreatorAction).sort((a, b) => (a.dueAt ?? a.expiresAt ?? a.createdAt).localeCompare(b.dueAt ?? b.expiresAt ?? b.createdAt)) ?? [];
  const active = data?.deals.filter(deal => deal.escrowStatus === 'HELD') ?? [];
  const name = data?.profile.displayName.split(' ')[0];
  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Bom dia' : now.getHours() < 19 ? 'Boa tarde' : 'Boa noite';
  const today = now.toLocaleDateString('pt-AO', { weekday: 'long', day: 'numeric', month: 'long' });
  const monthDeals = data?.deals.filter(deal => {
    const paidAt = deal.settledAt ?? deal.approvedAt;
    return deal.escrowStatus === 'RELEASED' && paidAt && new Date(paidAt).getMonth() === now.getMonth() && new Date(paidAt).getFullYear() === now.getFullYear();
  }) ?? [];
  const monthRevenue = monthDeals.reduce((sum, deal) => sum + BigInt(deal.creatorNet.amount), 0n);
  const agenda = data?.profile.settings?.agenda;
  const usedToday = data?.deals.filter(deal => deal.acceptedAt && new Date(deal.acceptedAt).toDateString() === now.toDateString()).length ?? 0;
  const capacity = agenda?.slotsPerDay;

  return <Screen header={<StudioHeader titulo={name ? greeting + ', ' + name : 'O meu painel'} subtitulo={today} accao={<div className="flex gap-2"><BellLink /><Link href="/definicoes" aria-label="Definições" className="icon-button"><Icon name="settings" className="size-[18px]" /></Link></div>} />}>
    <CreatorBoundary {...state} loading={!data} retry={state.reload}>
      {data && <>
        <Link href="/wallet" className="wallet-highlight relative block overflow-hidden rounded-[28px] p-[18px] text-lime-ink">
          <Flor className="pointer-events-none absolute -right-[34px] -bottom-10 size-[150px] opacity-[.16]" fill="var(--color-lime-ink)" />
          <div className="relative"><span className="block text-[10px] font-extrabold uppercase tracking-[.12em] opacity-70">Disponível para levantar</span><div className="algarismos mt-1 mb-3 text-[36px] leading-[1.35] font-[1000] tracking-[-.04em]">{formatMoney(data.wallet.available)}</div><span className="flex h-[46px] items-center justify-center rounded-full bg-lime-ink text-[14px] font-[900] text-[#e1f83b]">Levantar para Express</span></div>
        </Link>
        <div className="mt-2.5 grid grid-cols-2 gap-[9px]"><Metric label="Retido em trabalhos" value={formatMoney(data.wallet.reserved)} note={active.length + (active.length === 1 ? ' pedido em curso' : ' pedidos em curso')} /><Metric label="Este mês" value={formatMoney(creatorMoney(monthRevenue))} note={monthDeals.length + (monthDeals.length === 1 ? ' trabalho pago' : ' trabalhos pagos')} /></div>
        <div className="mt-[18px] mb-2 flex items-baseline justify-between"><Rotulo>Exige resposta</Rotulo><Link href="/estudio/caixa" className="text-[11.5px] font-[900] text-lime-text">{queue.length ? queue.length + (queue.length === 1 ? ' pedido' : ' pedidos') : 'Ver a caixa'}</Link></div>
        {queue.length ? <div className="flex flex-col gap-2">{queue.slice(0, 3).map(deal => <CreatorDealRow key={deal.id} deal={deal} compact />)}</div> : <div className="rounded-[20px] border-[1.5px] border-dashed border-line p-4 text-center"><p className="text-[13.5px] font-[900]">Tudo em dia</p><p className="mt-1 text-[12px] font-bold leading-[1.5] text-dim">Os pedidos que precisam da tua resposta aparecem aqui.</p><Link href={'/' + data.profile.handle + '/partilhar'} className="mt-2 inline-block py-1 text-[12px] font-[900] text-lime-text">Partilhar o meu link</Link></div>}
        <div className="mt-[18px] mb-2 flex items-center justify-between"><Rotulo>Vagas de hoje</Rotulo><Link href="/estudio/agenda" className="text-[11.5px] font-[900] text-lime-text">Gerir agenda</Link></div>
        <div className="rounded-[22px] border border-line bg-surface p-3.5">
          <div className="mb-2 flex items-center justify-between gap-3 text-[12.5px] font-[900]"><span>{data.profile.availabilityStatus === 'AVAILABLE' ? 'A receber pedidos' : data.profile.availabilityStatus === 'PAUSED' ? 'Em pausa' : 'Sem vagas'}</span><span className="algarismos text-dim">{capacity ? usedToday + ' / ' + capacity : data.profile.offers.length + (data.profile.offers.length === 1 ? ' oferta' : ' ofertas')}</span></div>
          {capacity ? <div className="h-1.5 overflow-hidden rounded-full bg-surface2"><div className={'anima-barra h-full rounded-full ' + (usedToday >= capacity ? 'bg-danger' : 'bg-lime')} style={{ width: Math.min(100, usedToday / capacity * 100) + '%' }} /></div> : <p className="text-[11.5px] font-bold text-dim">Define os dias e o número de vagas na tua agenda.</p>}
        </div>
        <div className="mt-5 mb-2"><Rotulo>O teu estúdio</Rotulo></div>
        <div className="grid grid-cols-2 gap-2">{([
          ['/estudio/ofertas', 'Ofertas', data.profile.offers.length + ' no catálogo', 'tag'],
          ['/estudio/agenda', 'Agenda', capacity ? capacity + ' vagas por dia' : 'Definir disponibilidade', 'calendar'],
          ['/wallet', 'Carteira', formatMoney(data.wallet.available) + ' disponível', 'wallet'],
          ['/estudio/numeros', 'Números', 'Resultados dos pedidos', 'chart'],
          ['/estudio/publicar', 'Publicar', 'Preparar conteúdo', 'camera'],
          ['/estudio/eventos', 'Eventos', 'Preparar um evento', 'calendar'],
        ] as const).map(([href, title, note, icon]) => <Link key={href} href={href} className="toque rounded-[22px] border border-line bg-surface p-[13px]"><span className="mb-2 flex size-[38px] items-center justify-center rounded-[13px] bg-surface2 text-lime-text"><Icon name={icon as IconName} className="size-[18px]" /></span><span className="block text-[13.5px] font-[900]">{title}</span><span className="mt-0.5 block text-[10.5px] font-bold text-dim">{note}</span></Link>)}</div>
      </>}
    </CreatorBoundary>
  </Screen>;
}
function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="min-w-0 rounded-[20px] border border-line bg-surface p-[13px]"><span className="block text-[9.5px] font-extrabold uppercase tracking-[.1em] text-dim">{label}</span><div className="algarismos mt-1 text-[19px] leading-[1.35] font-[1000] tracking-[-.03em]">{value}</div><p className="text-[11px] font-bold text-dim">{note}</p></div>;
}
