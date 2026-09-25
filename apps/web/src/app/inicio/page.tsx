'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { ACarregar } from '@/components/states';
import { Rotulo, Vazio } from '@/components/ui';
import { Avatar, BellLink, Chip, LinkAction, LoadError } from '@/components/viewer-ui';
import { estadoVisual } from '@/lib/deal-state';
import { formatMoney } from '@/lib/money';
import { useBuyerDeals, useCreatorFeed, useLocalSelection, useResource, type ViewerProfile } from '@/lib/viewer-data';

type Filter = 'all' | 'orders' | 'free' | 'unfollowed';

export default function HomePage() {
  const orders = useBuyerDeals();
  const discovery = useResource<{ profiles: ViewerProfile[] }>('/profiles');
  const following = useLocalSelection('following');
  const liked = useLocalSelection('liked-content');
  const allProfiles = discovery.data?.profiles ?? [];
  const followedProfiles = allProfiles.filter((profile) => following.values.includes(profile.handle));
  const feed = useCreatorFeed(followedProfiles.length ? followedProfiles : allProfiles);
  const [filter, setFilter] = useState<Filter>('all');
  const [moreFor, setMoreFor] = useState<string | null>(null);
  const active = (orders.data?.data ?? []).filter((deal) => !['PAID', 'DECLINED', 'REFUNDED', 'EXPIRED'].includes(deal.status));
  const visibleFeed = feed.data.filter((item) => filter !== 'free' || item.visibility === 'PUBLIC');
  const unfollowed = allProfiles.filter((profile) => !following.values.includes(profile.handle));

  return <Screen header={<>
    <div className="flex items-center justify-between gap-3">
      <div><h1 className="text-[22px] font-[1000] tracking-[-0.035em]">Boa tarde</h1><p className="text-[12px] font-[700] text-dim">{active.length} {active.length === 1 ? 'pedido em curso' : 'pedidos em curso'} · {feed.data.length} publicações novas</p></div>
      <span className="relative"><BellLink />{active.length > 0 && <span className="absolute top-0 right-0 size-2.5 rounded-full border-2 border-bg bg-lime" />}</span>
    </div>
    <div className="rolo -mx-4 mt-3 flex gap-1.5 px-4 pb-0.5">
      <Chip selected={filter === 'all'} onClick={() => setFilter('all')}>Tudo</Chip><Chip selected={filter === 'orders'} onClick={() => setFilter('orders')}>Com pedidos</Chip><Chip selected={filter === 'free'} onClick={() => setFilter('free')}>Só grátis</Chip><Chip selected={filter === 'unfollowed'} onClick={() => setFilter('unfollowed')}>Sem seguir</Chip>
    </div>
  </>} contentClassName="!pt-2">
    <div className="lg:grid lg:grid-cols-[minmax(280px,.72fr)_minmax(420px,1.28fr)] lg:items-start lg:gap-6">
      <div className="min-w-0">
        {orders.error ? <LoadError message={orders.error} retry={orders.retry} /> : orders.loading ? <ACarregar /> : active.length ? <section className="mb-5">
          <div className="mb-2 flex items-center justify-between"><Rotulo>Os teus pedidos</Rotulo><Link href="/meu?tab=pedidos" className="text-[12px] font-[900] text-lime-text">Ver todos</Link></div>
          <div className="rolo -mx-4 flex gap-2.5 px-4 lg:mx-0 lg:grid lg:px-0">{active.slice(0, filter === 'orders' ? undefined : 4).map((deal) => {
            const state = estadoVisual(deal.status, deal.escrowStatus);
            const progress = ['PROPOSED', 'COUNTER_OFFERED'].includes(deal.status) ? 22 : deal.status === 'DELIVERED' ? 82 : 55;
            return <Link key={deal.id} href={`/deals/${deal.id}`} className="w-[214px] shrink-0 rounded-[22px] border border-line bg-surface p-[13px] lg:w-full"><span className="flex items-start justify-between gap-2"><span className="line-clamp-2 text-[13.5px] leading-tight font-[900]">{deal.offer.title}</span><span className="shrink-0 rounded-full bg-surface2 px-2 py-1 text-[9px] font-[900] text-lime-text">{state.etiqueta}</span></span><span className="algarismos mt-2 block text-[11px] font-bold text-dim">{deal.dueAt ? `Prazo ${new Date(deal.dueAt).toLocaleDateString('pt-AO', { day: 'numeric', month: 'short' })}` : deal.reference}</span><span className="mt-2.5 block h-1.5 overflow-hidden rounded-full bg-surface2"><span className="block h-full rounded-full bg-lime" style={{ width: `${progress}%` }} /></span></Link>;
          })}</div>
        </section> : filter === 'orders' ? <Vazio titulo="Não tens pedidos em curso" texto="Os próximos pedidos aparecem aqui com a conversa e o prazo." accao={<LinkAction href="/descobrir">Descobrir criadores</LinkAction>} /> : null}

        {filter === 'unfollowed' && <section className="mb-5"><div className="mb-2"><Rotulo>Criadores que ainda não segues</Rotulo></div>{unfollowed.length ? <div className="space-y-2">{unfollowed.slice(0, 6).map(profile => <Link key={profile.id} href={`/${profile.handle}`} className="flex items-center gap-3 rounded-[22px] border border-line bg-surface p-3"><Avatar name={profile.displayName} url={profile.avatarUrl} /><span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-[900]">{profile.displayName}</span><span className="block truncate text-[11px] font-bold text-dim">{profile.category} · {profile.location}</span></span><Icon name="arrow" className="size-4 text-dim" /></Link>)}</div> : <Vazio titulo="Já segues todos" texto="Quando entrarem novos criadores, aparecem aqui." />}</section>}
      </div>

      {filter !== 'orders' && filter !== 'unfollowed' && <section className="min-w-0"><div className="mb-2 flex items-center justify-between"><Rotulo>Para ti</Rotulo><Link href="/descobrir" className="text-[12px] font-[900] text-lime-text">Descobrir</Link></div>
        {discovery.error ? <LoadError message={discovery.error} retry={discovery.retry} /> : discovery.loading || feed.loading ? <ACarregar /> : visibleFeed.length ? <div className="space-y-3">{visibleFeed.map((item) => <article key={item.id} className="overflow-hidden rounded-[26px] border border-line bg-surface">
          <div className="relative flex items-center gap-2.5 p-3"><Avatar name={item.creator.displayName} url={item.creator.avatarUrl} /><Link href={`/${item.creator.handle}`} className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-[900]">{item.creator.displayName}</span><span className="block text-[10.5px] font-bold text-dim">{new Date(item.publishedAt).toLocaleDateString('pt-AO', { day: 'numeric', month: 'short' })} · {item.kind === 'VIDEO' ? 'Vídeo' : item.kind === 'PLAYLIST' ? 'Playlist' : 'Publicação'}</span></Link><button aria-label="Mais opções" aria-expanded={moreFor === item.id} onClick={() => setMoreFor(moreFor === item.id ? null : item.id)} className="flex size-9 items-center justify-center rounded-full"><Icon name="more" className="size-5 text-dim" /></button>{moreFor === item.id && <div className="absolute top-12 right-3 z-10 w-48 overflow-hidden rounded-[18px] border border-line bg-bg p-1.5 shadow-2xl"><Link href={`/${item.creator.handle}`} className="block rounded-xl px-3 py-2.5 text-[12px] font-[900] hover:bg-surface">Ver perfil</Link><Link href={`/${item.creator.handle}/partilhar`} className="block rounded-xl px-3 py-2.5 text-[12px] font-[900] hover:bg-surface">Partilhar perfil</Link><button onClick={() => { following.toggle(item.creator.handle); setMoreFor(null); }} className="block w-full rounded-xl px-3 py-2.5 text-left text-[12px] font-[900] hover:bg-surface">{following.values.includes(item.creator.handle) ? 'Deixar de seguir' : 'Seguir criador'}</button></div>}</div>
          <Link href={`/${item.creator.handle}/p/${item.id}`} className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-surface2">{item.coverUrl ? <img src={item.coverUrl} alt="" className={`size-full object-cover ${item.access === 'LOCKED' ? 'scale-105 blur-md' : ''}`} /> : null}{item.access === 'LOCKED' && <span className="absolute flex flex-col items-center gap-2 rounded-[18px] bg-bg/85 px-5 py-4"><Icon name="lock" className="size-6" /><b className="algarismos text-[13px]">{item.price ? formatMoney(item.price) : 'Só membros'}</b></span>}</Link>
          <p className="px-3.5 pt-3 text-[13px] leading-[1.5] font-[700]">{item.caption}</p>
          <div className="flex items-center gap-1 px-2.5 py-2"><button aria-label={liked.values.includes(item.id) ? 'Retirar gosto' : 'Gostar'} aria-pressed={liked.values.includes(item.id)} onClick={() => liked.toggle(item.id)} className={`flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-extrabold ${liked.values.includes(item.id) ? 'text-lime-text' : 'text-dim'}`}><Icon name="heart" className="size-[17px]" />{liked.values.includes(item.id) ? 1 : 0}</button><Link aria-label="Abrir comentários" href={`/${item.creator.handle}/p/${item.id}`} className="flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-extrabold text-dim"><Icon name="chat" className="size-[17px]" />0</Link><Link aria-label="Partilhar" href={`/${item.creator.handle}/partilhar`} className="flex size-9 items-center justify-center text-dim"><Icon name="share" className="size-[17px]" /></Link><span className="flex-1" /><Link href={`/${item.creator.handle}/mimar`} className="flex h-9 items-center gap-1.5 rounded-full border border-line px-3 text-[11px] font-[900] text-lime-text"><Icon name="sparkle" className="size-4" />Mimar</Link></div>
          <div className="px-3.5 pb-3"><Link href={`/${item.creator.handle}/p/${item.id}`} className="flex min-h-12 w-full items-center justify-between rounded-full bg-lime px-5 text-[13px] font-[1000] text-lime-ink"><span>{item.access === 'LOCKED' ? 'Desbloquear publicação' : 'Ver publicação'}</span><span className="text-[10.5px] opacity-70">{item.access === 'LOCKED' && item.price ? formatMoney(item.price) : 'grátis'}</span></Link></div>
        </article>)}</div> : <Vazio titulo="Ainda sem conteúdo" texto="As publicações dos criadores aparecem aqui depois de aplicares a semente de desenvolvimento." />}
      </section>}
    </div>
  </Screen>;
}
