'use client';

import { Screen } from '@/components/screen';
import { ACarregar } from '@/components/states';
import { ConversationList } from '@/components/buyer-library';
import { BellLink, LinkAction, LoadError } from '@/components/viewer-ui';
import { Vazio } from '@/components/ui';
import { useBuyerDeals } from '@/lib/viewer-data';
import { useSession } from '@/lib/session';

export default function ConversationsPage() {
  const { ready, userId } = useSession();
  const orders = useBuyerDeals();
  return <Screen header={<div className="flex items-center justify-between"><div><h1 className="text-[24px] font-[1000] tracking-[-0.035em]">Conversas</h1><p className="text-[12px] font-[700] text-dim">Cada pedido, uma conversa.</p></div><BellLink /></div>}>
    {!ready || orders.loading ? <ACarregar /> : !userId ? <Vazio titulo="As tuas conversas" texto="Entra para continuar a falar com os criadores dos teus pedidos." accao={<LinkAction href="/entrar?next=%2Fconversas">Entrar</LinkAction>} /> : orders.error ? <LoadError message={orders.error} retry={orders.retry} /> : <ConversationList deals={orders.data?.data ?? []} />}
  </Screen>;
}
