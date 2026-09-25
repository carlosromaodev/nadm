'use client';

import Link from 'next/link';
import { Screen } from '@/components/screen';
import { ACarregar } from '@/components/states';
import { ConversationList } from '@/components/buyer-library';
import { Avatar, BellLink, LinkAction, LoadError } from '@/components/viewer-ui';
import { Vazio } from '@/components/ui';
import { useBuyerDeals, useResource, type DirectConversation } from '@/lib/viewer-data';
import { useSession } from '@/lib/session';

export default function ConversationsPage() {
  const { ready, userId } = useSession();
  const orders = useBuyerDeals();
  const directs = useResource<{ data: DirectConversation[] }>(ready && userId ? '/direct-conversations' : null, userId);
  const free = directs.data?.data ?? [];
  return <Screen header={<div className="flex items-center justify-between"><div><h1 className="text-[24px] font-[1000] tracking-[-0.035em]">Conversas</h1><p className="text-[12px] font-[700] text-dim">Cada pedido, uma conversa.</p></div><BellLink /></div>}>
    {!ready || orders.loading || directs.loading ? <ACarregar /> : !userId ? <Vazio titulo="As tuas conversas" texto="Entra para continuar a falar com os criadores dos teus pedidos." accao={<LinkAction href="/entrar?next=%2Fconversas">Entrar</LinkAction>} /> : orders.error ? <LoadError message={orders.error} retry={orders.retry} /> : directs.error ? <LoadError message={directs.error} retry={directs.retry} /> : <div className="mx-auto w-full max-w-4xl lg:grid lg:grid-cols-2 lg:gap-6"><section>{free.length > 0 && <><p className="rotulo mb-2">Mensagens grátis</p><div className="mb-5 overflow-hidden rounded-[24px] border border-line bg-surface">{free.map(thread => {
      const latest = thread.messages.at(-1);
      return <Link key={thread.id} href={`/${thread.creator?.handle}/dm`} className="flex items-center gap-3 border-b border-line p-3.5 last:border-0"><Avatar name={thread.creator?.displayName ?? 'Criador'} url={thread.creator?.avatarUrl} /><span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-[900]">{thread.creator?.displayName}</span><span className="mt-1 block truncate text-[12px] font-bold text-dim">{latest?.body ?? 'Mensagem grátis'}</span></span><span className="text-[10px] font-extrabold text-dim">{thread.lastMessageAt ? new Date(thread.lastMessageAt).toLocaleDateString('pt-AO', { day: 'numeric', month: 'short' }) : ''}</span></Link>;
    })}</div></>}</section><section><p className="rotulo mb-2">Pedidos</p><ConversationList deals={orders.data?.data ?? []} /></section></div>}
  </Screen>;
}
