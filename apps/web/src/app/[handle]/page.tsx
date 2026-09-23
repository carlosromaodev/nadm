'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Flor } from '@/components/flor';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { ACarregar } from '@/components/states';
import { Botao, Painel, Rotulo, Vazio } from '@/components/ui';
import { Avatar, BellLink, LinkAction, LoadError } from '@/components/viewer-ui';
import { formatMoney } from '@/lib/money';
import { useSession } from '@/lib/session';
import { profileOfferHref, useLocalSelection, useResource, type ContentItem, type ViewerProfile } from '@/lib/viewer-data';

type Tab = 'conteudo' | 'contratar' | 'reputacao';
interface PublicReview { id: string; rating: number; body: string | null; publishedAt: string }

export default function ProfilePage() {
  const { handle } = useParams<{ handle: string }>();
  const { userId, ready } = useSession();
  const profile = useResource<ViewerProfile>(`/profiles/${encodeURIComponent(handle)}`);
  const mine = useResource<ViewerProfile>(ready && userId ? '/profiles/me' : null, userId);
  const content = useResource<{ items: ContentItem[] }>(`/profiles/${encodeURIComponent(handle)}/content`, userId);
  const reputation = useResource<{ data: PublicReview[] }>(`/profiles/${encodeURIComponent(handle)}/reviews`);
  const followed = useLocalSelection('following');
  const [chosenTab, setTab] = useState<Tab | null>(null);
  const [followNote, setFollowNote] = useState(false);
  const own = mine.data?.handle === handle;

  if (profile.error) return <Screen><LoadError title={profile.status === 404 ? 'Perfil não encontrado' : undefined} message={profile.status === 404 ? 'Esta ligação não corresponde a um perfil publicado.' : profile.error} retry={profile.status === 404 ? undefined : profile.retry} /><LinkAction href="/descobrir" className="w-full">Descobrir criadores</LinkAction></Screen>;
  if (!profile.data) return <ACarregar />;
  const creator = profile.data;
  const tabNames = { content: ['conteudo', 'Conteúdo'], offers: ['contratar', 'Contratar'], reputation: ['reputacao', 'Reputação'] } as const;
  const tabs = (creator.tabOrder ?? ['content', 'offers', 'reputation']).map(key => tabNames[key]);
  const tab = chosenTab ?? tabs[0][0];
  const available = creator.availabilityStatus === 'AVAILABLE';
  const items = content.data?.items ?? [];
  const memberOffer = creator.offers.find((offer) => offer.kind === 'MEMBERSHIP');
  const offers = creator.offers.filter((offer) => offer.kind !== 'CONTENT_UNLOCK' && offer.kind !== 'MEMBERSHIP');
  const reviews = reputation.data?.data ?? [];
  const rating = reviews.length ? (reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toLocaleString('pt-AO', { maximumFractionDigits: 1 }) : '—';

  return <Screen header={<div className="flex items-center justify-between gap-2"><Link href={own ? '/estudio' : '/inicio'} className="flex items-center gap-2">{own ? <span className="rounded-full border border-line px-3 py-2 text-[12px] font-[900]">← Painel</span> : <Flor className="size-[30px]" />}<span><span className="block text-[22px] leading-none font-[1000] tracking-[-0.05em]">NaDM</span><span className="mt-1 block text-[10px] font-[800] uppercase tracking-wider text-dim">@{creator.handle}</span></span></Link><span className="flex items-center gap-2"><BellLink /><Link href={`/${handle}/partilhar`} className="inline-flex h-[38px] items-center gap-1.5 rounded-full border border-line px-3 text-[12px] font-[900]"><Icon name="share" className="size-[15px]" />Partilhar</Link></span></div>}>
    {!available && <div role="status" className="mb-3 rounded-[22px] border border-line bg-wash p-3.5"><p className="text-[13.5px] font-[900] text-amber">{creator.availabilityStatus === 'PAUSED' ? 'Em pausa' : 'Sem vagas neste momento'}</p><p className="mt-1 text-[12px] font-[700] text-dim">Os pedidos existentes continuam disponíveis. Volta mais tarde para novos pedidos.</p></div>}
    <div className="mb-3 flex items-center gap-[18px]"><span className="relative"><Avatar name={creator.displayName} large />{available && <span aria-label="A aceitar pedidos" className="absolute right-0.5 bottom-0.5 size-4 rounded-full border-[3px] border-bg bg-lime" />}</span><div className="grid flex-1 grid-cols-3 gap-2 text-center"><NumberFact value={content.data ? String(items.length) : '—'} label="publicações" /><NumberFact value="—" label="seguidores" /><NumberFact value="—" label="resposta" /></div></div>
    <h1 className="algarismos text-[21px] font-[1000] tracking-[-0.025em]">{creator.displayName}</h1>
    {creator.bio && <p className="mt-[5px] mb-2.5 text-[13.5px] leading-[1.5] font-[600] text-dim">{creator.bio}</p>}
    <div className="mb-3.5 flex flex-wrap gap-1.5">{[creator.location, creator.category].filter(Boolean).map((tag) => <span key={tag} className="rounded-full border border-line px-[11px] py-[5px] text-[12px] font-[800] text-dim">{tag}</span>)}</div>
    {own ? <div className="mb-4 flex gap-2"><LinkAction href="/estudio/perfil" secondary className="flex-1">Editar perfil</LinkAction><LinkAction href="/estudio/publicar" className="flex-1">Publicar</LinkAction></div> : <>
      <div className="mb-2 flex gap-2"><Link href={`/${handle}/membro`} className="flex min-h-12 flex-1 flex-col items-center justify-center rounded-full border-[1.5px] border-lime-text px-2"><span className="text-[14px] font-[900]">Ser membro</span><span className="text-[10px] font-[800] text-dim">{memberOffer ? `${formatMoney(memberOffer.price)}/mês` : 'Ver adesão'}</span></Link><LinkAction href={`/${handle}/dm`} className="flex-[1.2]">Abrir DM</LinkAction></div>
      {followNote && <p role="status" className="mb-3 text-[12px] font-[700] text-dim">{followed.storageError ? 'Não foi possível guardar a preferência neste navegador.' : 'A tua lista de criadores fica guardada neste dispositivo.'}</p>}
    </>}
    <Painel className="relative mt-3 overflow-hidden"><Flor className="pointer-events-none absolute -top-[30px] -right-[26px] size-[118px] opacity-[0.07]" /><div className="relative flex items-center gap-2"><Flor className="size-[15px]" /><Rotulo>Porque podes confiar</Rotulo></div><div className="relative mt-[13px] grid grid-cols-2 gap-x-4 gap-y-[13px]">
      <TrustFact label="Avaliações" value={rating} note={reviews.length ? reviews.length + ' verificadas' : 'a construir'} />
      <TrustFact label="Ofertas" value={String(offers.length)} note="no perfil" />
      <div className="col-span-2 flex items-center gap-2 border-t border-line pt-3"><Icon name="shield" className="size-[22px] text-lime-text" /><div><p className="text-[12px] font-[900]">Pagamento protegido</p><p className="text-[11px] font-bold text-dim">O valor fica retido até aprovares a entrega.</p></div></div>
    </div><div className="relative mt-3 flex items-center justify-between gap-2 border-t border-line pt-3"><span className="flex items-center gap-2"><span className={`size-2 rounded-full ${available ? 'bg-lime' : 'bg-amber'}`} /><span className="text-[11.5px] font-[900]">{available ? 'A aceitar pedidos' : 'Novos pedidos indisponíveis'}</span></span>{!own && <button className="text-[11.5px] font-[900] text-lime-text" aria-pressed={followed.values.includes(handle)} onClick={() => { followed.toggle(handle); setFollowNote(true); }}>{followed.values.includes(handle) ? 'A seguir ✓' : '+ Seguir'}</button>}</div></Painel>
    <div className="mt-3.5 mb-3.5 flex rounded-full border border-line bg-wash p-1" aria-label="Secções do perfil">{tabs.map(([value, label]) => <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)} className={`h-[38px] flex-1 rounded-full text-[12.5px] font-[900] ${tab === value ? 'bg-lime text-lime-ink' : 'text-dim'}`}>{label}</button>)}</div>
    {tab === 'conteudo' && <>{content.loading ? <ACarregar /> : content.error && content.status !== 404 ? <LoadError message={content.error} retry={content.retry} /> : items.length ? <><div className="mb-2 flex justify-between"><Rotulo>{items.length} publicações</Rotulo><span className="text-[12px] font-[800] text-dim">{items.filter((item) => item.visibility === 'PUBLIC').length} livres</span></div><div className="grid grid-cols-3 gap-1.5">{items.map((item) => <Link key={item.id} href={`/${handle}/${item.kind === 'PLAYLIST' ? 'playlist' : 'p'}/${item.id}`} className="relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-[16px] border border-line bg-surface2">{item.coverUrl ? <img src={item.coverUrl} alt={item.title || item.caption} className="size-full object-cover" /> : <Flor className="size-10 opacity-30" />}<span className="absolute inset-x-0 bottom-0 bg-bg/85 px-2 py-2 text-center text-[11px] font-[900]">{item.access === 'LOCKED' ? item.price ? formatMoney(item.price) : 'Membros' : item.kind === 'VIDEO' ? 'Vídeo' : item.kind === 'PLAYLIST' ? 'Playlist' : 'Livre'}</span></Link>)}</div></> : <Vazio titulo="Ainda sem publicações" texto={own ? 'Publica uma fotografia, um vídeo ou uma playlist para começar.' : 'As próximas publicações deste criador vão aparecer aqui.'} accao={own ? <LinkAction href="/estudio/publicar">Primeira publicação</LinkAction> : undefined} />}</>}
    {tab === 'contratar' && <div className="space-y-2">{offers.length ? offers.map((offer) => <div key={offer.id} className="rounded-[24px] border border-line bg-surface p-4"><div className="flex items-start justify-between gap-3"><h2 className="text-[15px] font-[1000]">{offer.title}</h2><span className="algarismos shrink-0 text-[16px] font-[1000] text-lime-text">{formatMoney(offer.price)}</span></div>{offer.description && <p className="mt-1.5 text-[12px] leading-relaxed font-[700] text-dim">{offer.description}</p>}<div className="mt-3 flex items-center justify-between gap-2"><span className="text-[12px] font-[800] text-dim">Prazo: {offer.slaHours < 24 ? `${offer.slaHours} h` : `${Math.ceil(offer.slaHours / 24)} dias`}</span>{available && !own ? <LinkAction href={profileOfferHref(handle, offer)} className="min-h-10 px-4 text-[12px]">{offer.kind === 'BOOKING' ? 'Escolher horário' : 'Pedir'}</LinkAction> : <span className="text-[12px] font-[800] text-dim">{own ? 'A tua oferta' : 'Indisponível'}</span>}</div></div>) : <Vazio titulo="Sem ofertas por agora" texto={own ? 'Cria uma oferta para receber os primeiros pedidos.' : 'Este criador ainda não tem ofertas publicadas.'} accao={own ? <LinkAction href="/estudio/ofertas">Criar oferta</LinkAction> : undefined} />}</div>}
    {tab === 'reputacao' && <>{reputation.loading ? <ACarregar /> : reputation.error ? <LoadError message={reputation.error} retry={reputation.retry} /> : reviews.length ? <section><div className="mb-3 flex items-center justify-between"><Rotulo>Avaliações verificadas</Rotulo><span className="algarismos text-[13px] font-[900] text-lime-text">{rating} / 5</span></div><div className="space-y-2">{reviews.map(review => <article key={review.id} className="rounded-[22px] border border-line bg-surface p-3.5"><div className="flex items-center justify-between gap-3"><span className="flex gap-1" aria-label={review.rating + ' de 5 flores'}>{Array.from({ length: 5 }, (_, index) => <Flor key={index} className={`size-[17px] ${index < review.rating ? '' : 'opacity-20'}`} />)}</span><time className="text-[10.5px] font-bold text-dim" dateTime={review.publishedAt}>{new Date(review.publishedAt).toLocaleDateString('pt-AO')}</time></div>{review.body && <p className="mt-2.5 text-[12.5px] font-bold leading-[1.5]">{review.body}</p>}<p className="mt-2 text-[10px] font-extrabold text-dim">Pedido concluído · avaliação verificada</p></article>)}</div></section> : <Vazio titulo="A confiança constrói-se" texto="As primeiras avaliações aparecem aqui depois de um trabalho concluído." />}</>}
    {!own && <Link href={userId ? '/criar-perfil' : '/entrar?next=%2Fcriar-perfil'} className="mt-6 flex items-center gap-3 rounded-[26px] border-[1.5px] border-dashed border-lime-text bg-wash p-4"><Flor className="size-9 shrink-0" /><span><span className="block text-[14.5px] font-[1000]">Criar o meu NaDM</span><span className="mt-0.5 block text-[12px] font-[700] text-dim">O teu link, as tuas ofertas, o teu preço.</span></span></Link>}
  </Screen>;
}

function NumberFact({ value, label }: { value: string; label: string }) {
  return <div><div className="algarismos text-[19px] font-[1000]">{value}</div><div className="text-[11px] font-[700] text-dim">{label}</div></div>;
}
function TrustFact({ label, value, note }: { label: string; value: string; note: string }) {
  return <div><div className="text-[9.5px] font-extrabold uppercase tracking-[.1em] text-dim">{label}</div><div className="mt-0.5 flex items-baseline gap-1.5"><span className="algarismos text-[17px] font-[1000] tracking-[-.03em]">{value}</span><span className="text-[10.5px] font-bold text-dim">{note}</span></div></div>;
}
