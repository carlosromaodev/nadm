'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Screen } from './screen';
import { ACarregar } from './states';
import { Vazio } from './ui';
import { Avatar, DealRow, LinkAction, LoadError } from './viewer-ui';
import { useBuyerDeals } from '@/lib/viewer-data';
import { useSession } from '@/lib/session';
import { estadoVisual } from '@/lib/deal-state';

export function BuyerLibrary() { return <Suspense fallback={<ACarregar />}><Library /></Suspense>; }

function Library() {
  const search = useSearchParams();
  const router = useRouter();
  const session = useSession();
  const tab = search.get('tab') ?? 'biblioteca';
  const orders = useBuyerDeals();
  const deals = orders.data?.data ?? [];
  const delivered = deals.filter((deal) => ['DELIVERED', 'APPROVED', 'PAID'].includes(deal.status));
  return <Screen header={<><div className="flex items-center justify-between"><h1 className="text-[24px] font-[1000] tracking-[-0.035em]">O que é meu</h1><Link href="/seguranca" className="rounded-full border border-line px-3 py-2 text-[12px] font-[900]">Conta</Link></div><div className="mt-3 flex rounded-full border border-line bg-wash p-1">{[['biblioteca', 'Biblioteca'], ['pedidos', 'Pedidos'], ['conversas', 'Conversas']].map(([value, label]) => <button key={value} aria-pressed={tab === value} onClick={() => router.replace(`/meu?tab=${value}`, { scroll: false })} className={`min-h-10 flex-1 rounded-full text-[12.5px] font-[900] ${tab === value ? 'bg-lime text-lime-ink' : 'text-dim'}`}>{label}</button>)}</div></>}>
    {!session.ready || orders.loading ? <ACarregar /> : !session.userId ? <Vazio titulo="O teu espaço está aqui" texto="Entra para ver os teus pedidos, entregas e conversas." accao={<LinkAction href="/entrar?next=%2Fmeu">Entrar</LinkAction>} /> : orders.error ? <LoadError message={orders.error} retry={orders.retry} /> : tab === 'conversas' ? <ConversationList deals={deals} /> : tab === 'pedidos' ? deals.length ? <div className="space-y-2">{deals.map((deal) => <DealRow key={deal.id} deal={deal} />)}</div> : <Vazio titulo="Ainda não pediste nada" texto="O que pedires fica aqui, com a conversa e o pagamento no mesmo sítio." accao={<LinkAction href="/descobrir">Descobrir criadores</LinkAction>} /> : delivered.length ? <><p className="mb-3 text-[12px] font-[700] text-dim">Entregas dos teus pedidos. Cada item abre a versão guardada na conversa.</p><div className="space-y-2">{delivered.map((deal) => <Link key={deal.id} href={`/deals/${deal.id}/entrega`} className="flex items-center gap-3 rounded-[20px] border border-line bg-surface p-3"><Avatar name={deal.offer.title} /><span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-[900]">{deal.offer.title}</span><span className="mt-1 block text-[12px] font-[700] text-dim">{deal.reference} · {deal.status === 'DELIVERED' ? 'À tua aprovação' : 'Entrega aprovada'}</span></span><span aria-hidden="true">›</span></Link>)}</div></> : <Vazio titulo="A tua biblioteca começa aqui" texto="As entregas dos teus pedidos aparecerão aqui. Conteúdo comprado só abre com acesso confirmado." accao={<LinkAction href="/descobrir">Descobrir criadores</LinkAction>} />}
  </Screen>;
}

export function ConversationList({ deals }: { deals: import('@/lib/api').Deal[] }) {
  if (!deals.length) return <Vazio titulo="Ainda sem conversas" texto="Escolhe uma oferta de um criador para começar. Cada pedido tem a sua conversa." accao={<LinkAction href="/descobrir">Descobrir criadores</LinkAction>} />;
  const sorted = [...deals].sort((a, b) => (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt));
  return <div>{sorted.map((deal) => <Link key={deal.id} href={`/deals/${deal.id}`} className="flex items-center gap-3 border-b border-line py-3"><Avatar name={deal.offer.title} /><span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-[900]">{deal.offer.title}</span><span className="mt-1 block truncate text-[12px] font-[700] text-dim">{deal.reference} · {estadoVisual(deal.status, deal.escrowStatus).etiqueta}</span></span><span className="text-[11px] font-[800] text-dim">{new Date(deal.lastMessageAt ?? deal.createdAt).toLocaleDateString('pt-AO', { day: 'numeric', month: 'short' })}</span></Link>)}</div>;
}
