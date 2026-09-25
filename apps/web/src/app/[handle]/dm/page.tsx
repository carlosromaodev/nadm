'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Flor } from '@/components/flor';
import { Icon } from '@/components/icon';
import { Screen, Voltar } from '@/components/screen';
import { ACarregar } from '@/components/states';
import { Vazio } from '@/components/ui';
import { Avatar, LinkAction, LoadError } from '@/components/viewer-ui';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/money';
import { useSession } from '@/lib/session';
import { errorMessage, profileOfferHref, useResource, type DirectConversation, type ViewerProfile } from '@/lib/viewer-data';

export default function DmPage() {
  const { handle } = useParams<{ handle: string }>();
  const { userId, ready } = useSession();
  const profileResource = useResource<ViewerProfile>(`/profiles/${encodeURIComponent(handle)}`);
  const direct = useResource<DirectConversation>(ready && userId ? `/profiles/${encodeURIComponent(handle)}/direct-messages` : null, userId);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const profile = profileResource.data;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const message = body.trim();
    if (!message || !userId || sending) return;
    setSending(true); setSendError(null);
    try {
      await api(`/profiles/${encodeURIComponent(handle)}/direct-messages`, {
        method: 'POST', actorUserId: userId,
        body: { body: message, clientId: crypto.randomUUID() },
      });
      setBody(''); direct.retry();
    } catch (error) { setSendError(errorMessage(error)); }
    finally { setSending(false); }
  }

  if (profileResource.error) return <Screen header={<div className="flex items-center gap-3"><Voltar href={`/${handle}`} /><h1 className="font-[900]">Abrir DM</h1></div>}><LoadError message={profileResource.error} retry={profileResource.retry} /></Screen>;
  if (!profile) return <ACarregar />;
  const offers = profile.offers.filter((offer) => ['CUSTOM_SERVICE', 'DIRECT_MESSAGE', 'BOOKING'].includes(offer.kind));
  const available = profile.availabilityStatus === 'AVAILABLE';
  const composer = !ready ? null : !userId ? <LinkAction href={`/entrar?next=${encodeURIComponent(`/${handle}/dm`)}`} className="w-full">Entrar para mandar mensagem</LinkAction> : <form onSubmit={submit} className="flex items-center gap-2"><input value={body} onChange={event => setBody(event.target.value)} maxLength={1200} aria-label="Mensagem gratuita" placeholder={direct.data?.canSendFree === false ? `Disponível ${direct.data.nextFreeAt ? new Date(direct.data.nextFreeAt).toLocaleDateString('pt-AO', { day: 'numeric', month: 'short' }) : 'na próxima semana'}` : 'Escrever mensagem grátis'} disabled={sending || direct.data?.canSendFree === false} className="h-12 min-w-0 flex-1 rounded-full border border-line bg-wash px-4 text-[13.5px] font-bold placeholder:text-dim disabled:opacity-60" /><button type="submit" aria-label="Enviar mensagem" disabled={!body.trim() || sending || direct.data?.canSendFree === false} className="flex size-12 shrink-0 items-center justify-center rounded-full bg-lime text-lime-ink disabled:opacity-40"><Icon name="send" className="size-[19px]" /></button></form>;

  return <Screen header={<div className="flex items-center gap-2.5"><Voltar href={`/${handle}`} /><Avatar name={profile.displayName} url={profile.avatarUrl} /><div className="min-w-0 flex-1"><h1 className="flex items-center gap-1.5 truncate text-[14.5px] font-[900]">{profile.displayName}{profile.verified && <Flor className="size-3 text-lime-text" />}</h1><p className="truncate text-[11.5px] font-bold text-dim">{profile.responseTimeHours ? `Responde em ~${profile.responseTimeHours}h` : available ? 'A aceitar pedidos' : 'Em pausa'} · sem promessa na DM grátis</p></div></div>} footer={<div>{sendError && <p role="alert" className="mb-2 text-center text-[11px] font-extrabold text-danger">{sendError}</p>}{composer}</div>}>
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-2.5">
      <div className="max-w-[280px] self-start rounded-[22px_22px_22px_8px] border border-line bg-surface px-3.5 py-3 text-[13.5px] leading-[1.5] font-[700]">{available ? 'Olá! Podes deixar uma mensagem grátis ou escolher uma forma de trabalharmos juntos.' : 'Os pedidos pagos estão em pausa, mas podes deixar uma mensagem para quando eu voltar.'}</div>

      {direct.loading && userId ? <ACarregar /> : direct.error ? <LoadError message={direct.error} retry={direct.retry} /> : direct.data?.messages.map(message => <div key={message.id} className={`max-w-[78%] px-3.5 py-2.5 text-[13.5px] leading-[1.45] font-[700] ${message.senderUserId === userId ? 'self-end rounded-[22px_22px_8px_22px] bg-lime text-lime-ink' : 'self-start rounded-[22px_22px_22px_8px] border border-line bg-surface'}`}>{message.body}<span className="mt-1 block text-right text-[9.5px] opacity-60">{new Date(message.createdAt).toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit' })}</span></div>)}

      <div className="mt-2 text-[9.5px] font-extrabold tracking-[.12em] text-dim uppercase">O que podes pedir</div>
      <div className="flex flex-col gap-[7px]">
        <div className="flex items-center justify-between gap-2 rounded-[20px] border border-dashed border-line bg-wash p-[13px]"><span className="flex min-w-0 items-center gap-2.5"><span className="size-[7px] rounded-full bg-lime" /><span><b className="block text-[14px] font-[900]">Mensagem grátis</b><span className="block text-[11.5px] font-bold text-dim">sem promessa de resposta</span></span></span><span className="text-right"><b className="algarismos block text-[15px] font-[1000]">0 Kz</b><span className="text-[10.5px] font-extrabold text-dim">1 por semana</span></span></div>
        {offers.map((offer) => {
          const inner = <><span className="flex min-w-0 items-center gap-2.5"><span className={`size-[7px] shrink-0 rounded-full ${available ? 'bg-lime' : 'bg-amber'}`} /><span className="min-w-0"><span className="block truncate text-[14px] font-[900]">{offer.title}</span><span className="block text-[11.5px] font-bold text-dim">{offer.kind === 'BOOKING' ? 'Escolhe um horário' : `Prazo: ${offer.slaHours} h`}</span></span></span><span className="shrink-0 text-right"><span className="algarismos block text-[15px] font-[1000]">{formatMoney(offer.price)}</span><span className="text-[10.5px] font-extrabold text-lime-text">Ver detalhes</span></span></>;
          return available ? <Link key={offer.id} href={profileOfferHref(handle, offer)} className="flex items-center justify-between gap-2 rounded-[20px] border border-line bg-surface p-[13px]">{inner}</Link> : <div key={offer.id} className="flex items-center justify-between gap-2 rounded-[20px] border border-line bg-surface p-[13px] opacity-60">{inner}</div>;
        })}
        <Link href={`/${handle}/mimar`} className="flex items-center gap-3 rounded-[20px] border border-line bg-surface p-[13px]"><span className="flex size-9 items-center justify-center rounded-xl bg-surface2 text-lime-text"><Icon name="sparkle" className="size-[18px]" /></span><span className="flex-1"><span className="block text-[13.5px] font-[900]">Mimar · apoio livre</span><span className="block text-[12px] font-bold text-dim">Sem prazo nem entrega</span></span><Icon name="arrow" className="size-4 text-dim" /></Link>
      </div>
      {!offers.length && <Vazio titulo="Sem ofertas disponíveis" texto="Ainda podes deixar a tua mensagem gratuita." />}
    </div>
  </Screen>;
}
