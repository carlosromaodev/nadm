'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CreatorBoundary, creatorLink } from '@/components/creator-ui';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { StudioHeader } from '@/components/studio-nav';
import { Rotulo, Vazio } from '@/components/ui';
import { Chip } from '@/components/viewer-ui';
import { creatorDeadline, hasCreatorAction, useCreatorData } from '@/lib/creator-api';
import { estadoVisual } from '@/lib/deal-state';
import { formatMoney } from '@/lib/money';

const FILTERS = ['Todos', 'A decidir', 'A entregar', 'Entregues', 'Dinheiro'] as const;
export default function CaixaPage() {
  const state = useCreatorData();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('Todos');
  const deals = state.data?.deals ?? [];
  const queue = deals.filter(hasCreatorAction);
  const filtered = deals.filter(deal => {
    if (filter === 'A decidir' && !(deal.status === 'PROPOSED' && deal.escrowStatus === 'HELD')) return false;
    if (filter === 'A entregar' && !['ACCEPTED', 'IN_PROGRESS'].includes(deal.status)) return false;
    if (filter === 'Entregues' && deal.status !== 'DELIVERED') return false;
    if (filter === 'Dinheiro' && deal.escrowStatus !== 'RELEASED') return false;
    return (deal.offer.title + ' ' + deal.reference + ' ' + (deal.brief ?? '') + ' ' + formatMoney(deal.price)).toLocaleLowerCase().includes(search.toLocaleLowerCase());
  }).sort((a, b) => (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt));
  const groups = new Map<string, typeof deals>();
  const today = new Date().toLocaleDateString('pt-AO', { timeZone: 'Africa/Luanda' });
  filtered.forEach(deal => {
    const date = new Date(deal.lastMessageAt ?? deal.createdAt).toLocaleDateString('pt-AO', { timeZone: 'Africa/Luanda' });
    const group = date === today ? 'Hoje' : date;
    groups.set(group, [...(groups.get(group) ?? []), deal]);
  });
  return <Screen header={<>
    <StudioHeader titulo="Caixa" subtitulo={queue.length + (queue.length === 1 ? ' pedido precisa de ti' : ' pedidos precisam de ti')} accao={<span className="rounded-full border border-line px-3 py-[6px] text-[11px] font-[1000] text-lime-text">{queue.length} {queue.length === 1 ? 'pendente' : 'pendentes'}</span>} />
    <label className="mt-[11px] flex h-11 items-center gap-[9px] rounded-full border border-line bg-wash px-[15px]"><Icon name="search" className="size-4 text-dim" /><input type="search" aria-label="Procurar na caixa" value={search} onChange={event => setSearch(event.target.value)} placeholder="Procurar pedido, referência ou valor" className="min-w-0 flex-1 bg-transparent text-[13px] font-bold placeholder:text-dim" /></label>
    <div className="rolo -mx-4 mt-[11px] flex gap-1.5 px-4 pb-0.5">{FILTERS.map(value => <Chip key={value} selected={value === filter} onClick={() => setFilter(value)}>{value}</Chip>)}</div>
  </>} contentClassName="!pt-2">
    <CreatorBoundary {...state} loading={!state.data} retry={state.reload}>
      {state.data && <div className="mb-4 grid grid-cols-3 gap-[7px]"><button onClick={() => setFilter('A decidir')} className="rounded-[20px] border border-line bg-surface p-3 text-left"><span className="block text-[9px] font-extrabold uppercase tracking-wider text-dim">A decidir</span><span className="algarismos mt-1 block text-[22px] font-[1000] text-amber">{deals.filter(deal => deal.status === 'PROPOSED' && deal.escrowStatus === 'HELD').length}</span></button><button onClick={() => setFilter('A entregar')} className="rounded-[20px] border border-line bg-surface p-3 text-left"><span className="block text-[9px] font-extrabold uppercase tracking-wider text-dim">A entregar</span><span className="algarismos mt-1 block text-[22px] font-[1000]">{deals.filter(deal => ['ACCEPTED', 'IN_PROGRESS'].includes(deal.status)).length}</span></button><Link href="/wallet" className="rounded-[20px] border border-line bg-surface p-3"><span className="block text-[9px] font-extrabold uppercase tracking-wider text-dim">Retido</span><span className="algarismos mt-1 block break-words text-[16px] font-[1000] text-lime-text">{formatMoney(state.data.wallet.reserved)}</span></Link></div>}
      {filtered.length ? [...groups].map(([label, rows]) => <section key={label} className="mb-3.5"><div className="mb-2 flex items-center gap-[9px]"><Rotulo>{label}</Rotulo><span className="h-px flex-1 bg-line" /><span className="algarismos text-[10px] font-extrabold text-dim">{rows.length}</span></div><div className="space-y-2">{rows.map(deal => {
        const visual = estadoVisual(deal.status, deal.escrowStatus);
        const action = hasCreatorAction(deal);
        return <Link key={deal.id} href={'/deals/' + deal.id} className="toque relative flex items-center gap-[11px] overflow-hidden rounded-[20px] border border-line bg-surface p-[13px]">
          {action && <span className={`absolute inset-y-0 left-0 w-[3px] ${visual.tom === 'espera' ? 'bg-amber' : 'bg-lime'}`} />}
          <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[13px] bg-surface2 text-lime-text"><Icon name={deal.escrowStatus === 'RELEASED' ? 'wallet' : deal.offer.kind === 'DIRECT_MESSAGE' ? 'chat' : 'inbox'} className="size-4" /></span>
          <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-[900]">{deal.offer.title}</span><span className="mt-0.5 block text-[10.5px] font-extrabold uppercase tracking-[.04em] text-dim">{visual.etiqueta}</span><span className="mt-0.5 block text-[11px] font-bold text-dim">{deal.reference}</span></span>
          <span className="shrink-0 text-right"><span className="algarismos block text-[14px] font-[1000] tracking-[-.02em]">{formatMoney(deal.creatorNet)}</span><span className={`mt-[3px] block text-[10.5px] font-extrabold ${action ? 'text-amber' : 'text-dim'}`}>{creatorDeadline(deal) || visual.retido}</span></span>
        </Link>;
      })}</div></section>) : <Vazio titulo={search || filter !== 'Todos' ? 'Nenhum resultado' : 'Caixa limpa'} texto={search || filter !== 'Todos' ? 'Experimenta outro filtro ou pesquisa.' : 'Partilha o teu link para começar a receber pedidos.'} accao={state.data && <Link href={'/' + state.data.profile.handle + '/partilhar'} className={creatorLink}>Partilhar o meu link</Link>} />}
    </CreatorBoundary>
  </Screen>;
}
