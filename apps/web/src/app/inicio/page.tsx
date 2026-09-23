'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { ACarregar } from '@/components/states';
import { Rotulo, Vazio } from '@/components/ui';
import { BellLink, Chip, DealRow, LinkAction, LoadError, ProfileCard } from '@/components/viewer-ui';
import { useBuyerDeals, useLocalSelection, useResource, type ViewerProfile } from '@/lib/viewer-data';

export default function HomePage() {
  const orders = useBuyerDeals();
  const discovery = useResource<{ profiles: ViewerProfile[] }>('/profiles');
  const following = useLocalSelection('following');
  const [filter, setFilter] = useState<'following' | 'orders' | 'available'>('following');
  const active = (orders.data?.data ?? []).filter((deal) => !['PAID', 'DECLINED', 'REFUNDED', 'EXPIRED'].includes(deal.status));
  const profiles = (discovery.data?.profiles ?? []).filter((profile) => following.values.includes(profile.handle) && (filter !== 'available' || profile.availabilityStatus === 'AVAILABLE'));

  return <Screen header={<><div className="flex items-center justify-between gap-3"><div><h1 className="text-[22px] font-[1000] tracking-[-0.035em]">Olá, que bom ver-te.</h1><p className="text-[12px] font-[700] text-dim">Os teus pedidos e os criadores que segues.</p></div><span className="flex gap-2"><BellLink /><Link href="/definicoes" aria-label="Definições" className="icon-button"><Icon name="settings" className="size-[18px]" /></Link></span></div><div className="mt-3 flex gap-1.5 overflow-x-auto"><Chip selected={filter === 'following'} onClick={() => setFilter('following')}>A seguir</Chip><Chip selected={filter === 'orders'} onClick={() => setFilter('orders')}>Só pedidos</Chip><Chip selected={filter === 'available'} onClick={() => setFilter('available')}>Disponíveis</Chip></div></>}>
    {orders.error ? <LoadError message={orders.error} retry={orders.retry} /> : orders.loading ? <ACarregar /> : active.length ? <section className="mb-5"><div className="mb-2 flex items-center justify-between"><Rotulo>Os teus pedidos</Rotulo><Link href="/meu?tab=pedidos" className="text-[12px] font-[900] text-lime-text">Ver todos</Link></div><div className="space-y-2">{active.slice(0, filter === 'orders' ? undefined : 3).map((deal) => <DealRow key={deal.id} deal={deal} />)}</div></section> : filter === 'orders' ? <Vazio titulo="Não tens pedidos em curso" texto="Os próximos pedidos aparecem aqui com a conversa e o prazo." accao={<LinkAction href="/descobrir">Descobrir criadores</LinkAction>} /> : null}
    {filter !== 'orders' && <>{discovery.error ? <LoadError message={discovery.error} retry={discovery.retry} /> : discovery.loading ? <ACarregar /> : !profiles.length ? <Vazio titulo={following.values.length ? 'Sem criadores neste filtro' : 'Ainda não segues ninguém'} texto="Procura por nome, categoria ou cidade e acompanha os criadores que gostas." accao={<LinkAction href="/descobrir">Descobrir criadores</LinkAction>} /> : <section><div className="mb-2"><Rotulo>Quem segues</Rotulo></div><div className="space-y-2">{profiles.map((profile) => <ProfileCard key={profile.id} profile={profile} />)}</div><p className="mt-3 text-[12px] font-[700] text-dim">Lista guardada neste dispositivo. Abre um perfil para ver as publicações.</p></section>}</>}
  </Screen>;
}
