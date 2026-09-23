'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Screen } from '@/components/screen';
import { ACarregar } from '@/components/states';
import { Vazio } from '@/components/ui';
import { Chip, LinkAction, LoadError } from '@/components/viewer-ui';
import { estadoVisual } from '@/lib/deal-state';
import { formatMoney } from '@/lib/money';
import { useSession } from '@/lib/session';
import { useLocalSelection, useResource } from '@/lib/viewer-data';
import type { Deal } from '@/lib/api';

export default function NotificationsPage() {
  const { userId, ready, mode } = useSession();
  const orders = useResource<{ data: Deal[] }>(ready && userId ? `/deals?role=${mode === 'creator' ? 'creator' : 'buyer'}` : null, userId);
  const read = useLocalSelection('notifications-read');
  const [filter, setFilter] = useState('all');
  const key = (deal: Deal) => `${deal.id}:${deal.status}:${deal.escrowStatus}:${deal.lastMessageAt ?? deal.createdAt}`;
  const all = orders.data?.data ?? [];
  const notifications = all.filter((deal) => filter === 'deadline' ? Boolean(deal.dueAt && ['ACCEPTED', 'IN_PROGRESS', 'DELIVERED'].includes(deal.status)) : filter === 'money' ? deal.escrowStatus !== 'PENDING' : true);
  return <Screen header={<><div className="flex items-center justify-between gap-3"><h1 className="text-[24px] font-[1000] tracking-[-0.035em]">Avisos</h1><button disabled={!all.length || all.every((deal) => read.values.includes(key(deal)))} onClick={() => read.update([...new Set([...read.values, ...all.map(key)])])} className="min-h-11 rounded-full border border-line px-3 text-[12px] font-[900] disabled:opacity-40">Marcar lidos</button></div><div className="mt-3 flex gap-2">{[['all', 'Tudo'], ['deadline', 'Com prazo'], ['money', 'Dinheiro']].map(([value, label]) => <Chip key={value} selected={filter === value} onClick={() => setFilter(value)}>{label}</Chip>)}</div></>}>
    <p className="mb-3 text-[12px] font-[700] text-dim">Actividade dos teus pedidos. A marca de leitura fica neste dispositivo; o histórico não é apagado.</p>
    {!ready || orders.loading ? <ACarregar /> : !userId ? <Vazio titulo="Os teus avisos" texto="Entra para acompanhar o estado dos teus pedidos." accao={<LinkAction href="/entrar?next=%2Fnotificacoes">Entrar</LinkAction>} /> : orders.error ? <LoadError message={orders.error} retry={orders.retry} /> : !notifications.length ? <Vazio titulo="Nada para acompanhar agora" texto="Os pedidos, prazos e pagamentos aparecem aqui quando houver actividade." /> : <div className="space-y-2">{notifications.map((deal) => {
      const state = estadoVisual(deal.status, deal.escrowStatus);
      const wasRead = read.values.includes(key(deal));
      return <article key={deal.id} className={`relative overflow-hidden rounded-[22px] border border-line bg-surface p-4 ${wasRead ? 'opacity-75' : ''}`}><span className={`absolute inset-y-0 left-0 w-1 ${state.tom === 'mau' ? 'bg-danger' : state.tom === 'espera' ? 'bg-amber' : 'bg-lime'}`} /><div className="flex items-center justify-between gap-2"><h2 className="text-[14px] font-[900]">{state.etiqueta}</h2>{!wasRead && <span aria-label="Não lido" className="size-2 shrink-0 rounded-full bg-lime" />}</div><p className="mt-1 text-[12px] font-[700] text-dim">{deal.offer.title} · {formatMoney(deal.amount)}</p>{deal.dueAt && <p className="mt-1 text-[12px] font-[800] text-dim">Prazo: {new Date(deal.dueAt).toLocaleString('pt-AO', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Africa/Luanda' })} WAT</p>}<Link href={`/deals/${deal.id}`} onClick={() => read.update([...new Set([...read.values, key(deal)])])} className="mt-3 inline-flex min-h-10 items-center rounded-full border border-line px-4 text-[12px] font-[900]">Abrir pedido</Link></article>;
    })}</div>}
    {read.storageError && <p role="alert" className="mt-3 text-[12px] text-danger">Não foi possível guardar as marcas de leitura neste navegador.</p>}
  </Screen>;
}
