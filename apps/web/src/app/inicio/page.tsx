'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { ACarregar } from '@/components/states';
import { Rotulo, Vazio } from '@/components/ui';
import { Avatar, BellLink, Chip, DealRow, LinkAction, LoadError, ProfileCard } from '@/components/viewer-ui';
import { formatMoney } from '@/lib/money';
import { useBuyerDeals, useCreatorFeed, useLocalSelection, useResource, type ViewerProfile } from '@/lib/viewer-data';

export default function HomePage() {
  const orders = useBuyerDeals();
  const discovery = useResource<{ profiles: ViewerProfile[] }>('/profiles');
  const following = useLocalSelection('following');
  const feed = useCreatorFeed(discovery.data?.profiles ?? []);
  const [filter, setFilter] = useState<'following' | 'orders' | 'available'>('following');
  const active = (orders.data?.data ?? []).filter((deal) => !['PAID', 'DECLINED', 'REFUNDED', 'EXPIRED'].includes(deal.status));
  const profiles = (discovery.data?.profiles ?? []).filter((profile) => following.values.includes(profile.handle) && (filter !== 'available' || profile.availabilityStatus === 'AVAILABLE'));

  return <Screen header={<><div className="flex items-center justify-between gap-3"><div><h1 className="text-[22px] font-[1000] tracking-[-0.035em]">Olá, que bom ver-te.</h1><p className="text-[12px] font-[700] text-dim">Os teus pedidos e os criadores que segues.</p></div><span className="flex gap-2"><BellLink /><Link href="/definicoes" aria-label="Definições" className="icon-button"><Icon name="settings" className="size-[18px]" /></Link></span></div><div className="mt-3 flex gap-1.5 overflow-x-auto"><Chip selected={filter === 'following'} onClick={() => setFilter('following')}>A seguir</Chip><Chip selected={filter === 'orders'} onClick={() => setFilter('orders')}>Só pedidos</Chip><Chip selected={filter === 'available'} onClick={() => setFilter('available')}>Disponíveis</Chip></div></>}>
    {orders.error ? <LoadError message={orders.error} retry={orders.retry} /> : orders.loading ? <ACarregar /> : active.length ? <section className="mb-5"><div className="mb-2 flex items-center justify-between"><Rotulo>Os teus pedidos</Rotulo><Link href="/meu?tab=pedidos" className="text-[12px] font-[900] text-lime-text">Ver todos</Link></div><div className="space-y-2">{active.slice(0, filter === 'orders' ? undefined : 3).map((deal) => <DealRow key={deal.id} deal={deal} />)}</div></section> : filter === 'orders' ? <Vazio titulo="Não tens pedidos em curso" texto="Os próximos pedidos aparecem aqui com a conversa e o prazo." accao={<LinkAction href="/descobrir">Descobrir criadores</LinkAction>} /> : null}
    {filter !== 'orders' && <>{discovery.error ? <LoadError message={discovery.error} retry={discovery.retry} /> : discovery.loading ? <ACarregar /> : <>
      {profiles.length ? <section className="mb-5"><div className="mb-2"><Rotulo>Quem segues</Rotulo></div><div className="space-y-2">{profiles.map((profile) => <ProfileCard key={profile.id} profile={profile} />)}</div></section> : <div className="mb-5"><Vazio titulo={following.values.length ? 'Sem criadores neste filtro' : 'Ainda não segues ninguém'} texto="Podes começar pelo conteúdo recomendado abaixo ou descobrir mais criadores." accao={<LinkAction href="/descobrir">Descobrir criadores</LinkAction>} /></div>}
      <section><div className="mb-2 flex items-center justify-between"><Rotulo>Conteúdo para ti</Rotulo><Link href="/descobrir" className="text-[12px] font-[900] text-lime-text">Ver criadores</Link></div>
        {feed.loading ? <ACarregar /> : feed.data.length ? <div className="grid grid-cols-2 gap-2.5">{feed.data.map((item) => <Link key={item.id} href={`/${item.creator.handle}/p/${item.id}`} className="overflow-hidden rounded-[22px] border border-line bg-surface">
          <span className="relative flex aspect-[4/5] items-center justify-center overflow-hidden bg-surface2">{item.coverUrl ? <img src={item.coverUrl} alt={item.caption} className="size-full object-cover" /> : <Icon name="lock" className="size-7 text-dim" />}{item.access === 'LOCKED' && <span className="absolute right-2 bottom-2 rounded-full bg-bg/90 px-2.5 py-1 text-[10px] font-[900]">{item.price ? formatMoney(item.price) : 'Membros'}</span>}</span>
          <span className="block p-2.5"><span className="flex items-center gap-2"><Avatar name={item.creator.displayName} url={item.creator.avatarUrl} /><span className="min-w-0"><span className="block truncate text-[11.5px] font-[900]">{item.creator.displayName}</span><span className="block truncate text-[10px] font-bold text-dim">@{item.creator.handle}</span></span></span><span className="mt-2 line-clamp-2 block text-[11.5px] font-[700] leading-relaxed">{item.caption}</span></span>
        </Link>)}</div> : <Vazio titulo="Ainda sem conteúdo" texto="As publicações dos criadores aparecem aqui depois de aplicares a semente de desenvolvimento." />}
      </section>
    </>}</>}
  </Screen>;
}
