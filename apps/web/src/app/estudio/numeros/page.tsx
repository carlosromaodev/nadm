'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { StudioHeader } from '@/components/studio-nav';
import { Rotulo, Vazio } from '@/components/ui';
import { CreatorBoundary } from '@/components/creator-ui';
import { creatorMoney, useCreatorData } from '@/lib/creator-api';
import { formatMoney } from '@/lib/money';

export default function NumerosPage() {
  const state = useCreatorData();
  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - period + 1);
  const all = state.data?.deals ?? [];
  const deals = all.filter(deal => new Date(deal.createdAt) >= start);
  const done = all.filter(deal => deal.escrowStatus === 'RELEASED' && (deal.settledAt ?? deal.approvedAt) && new Date((deal.settledAt ?? deal.approvedAt)!) >= start);
  const gross = done.reduce((sum, deal) => sum + BigInt(deal.price.amount), 0n);
  const fees = done.reduce((sum, deal) => sum + BigInt(deal.creatorFee.amount), 0n);
  const revenue = gross - fees;
  const sources = new Map<string, bigint>();
  done.forEach(deal => sources.set(deal.offer.title, (sources.get(deal.offer.title) ?? 0n) + BigInt(deal.creatorNet.amount)));
  const bars = Array.from({ length: 7 }, (_, index) => {
    const from = new Date(start.getTime() + period * 86400000 * index / 7);
    const until = new Date(start.getTime() + period * 86400000 * (index + 1) / 7);
    return done.filter(deal => { const date = new Date((deal.settledAt ?? deal.approvedAt)!); return date >= from && date < until; }).reduce((sum, deal) => sum + BigInt(deal.creatorNet.amount), 0n);
  });
  const max = bars.reduce((largest, value) => value > largest ? value : largest, 0n);
  return <Screen header={<StudioHeader titulo="Números" subtitulo="O teu trabalho, em números" accao={<Link href="/wallet" aria-label="Abrir carteira" className="icon-button"><Icon name="wallet" className="size-[17px]" /></Link>} />}>
    <CreatorBoundary {...state} loading={!state.data} retry={state.reload}>
      <div className="mb-3 flex gap-1.5">{([7, 30, 90] as const).map(value => <button key={value} aria-pressed={period === value} onClick={() => setPeriod(value)} className={`h-[34px] flex-1 rounded-full text-[12px] font-[900] ${period === value ? 'bg-lime text-lime-ink' : 'border border-line text-dim'}`}>{value} dias</button>)}</div>
      <section className="wallet-highlight overflow-hidden rounded-[28px] p-[18px] text-lime-ink">
        <div className="text-[10px] font-extrabold uppercase tracking-[.12em] opacity-70">Recebeste, depois das taxas</div>
        <div className="algarismos mt-1 text-[34px] font-[1000] tracking-[-.04em]">{formatMoney(creatorMoney(revenue))}</div>
        <p className="mt-0.5 text-[11.5px] font-extrabold opacity-75">{done.length} trabalhos pagos nos últimos {period} dias</p>
        <div className="mt-5 flex h-[76px] items-end justify-between gap-2" aria-label="Receita por período">{bars.map((value, index) => <span key={index} title={formatMoney(creatorMoney(value))} className="min-h-[3px] flex-1 rounded-t-[5px] bg-lime-ink" style={{ height: max > 0n ? String(value * 100n / max) + '%' : '3px', opacity: .2 + index * .1 }} />)}</div>
        <div className="mt-2 flex justify-between text-[10px] font-extrabold opacity-70"><span>{start.toLocaleDateString('pt-AO', { day: 'numeric', month: 'short' })}</span><span>Hoje</span></div>
      </section>
      <div className="mt-2.5 grid grid-cols-2 gap-[9px]">{[['Pedidos recebidos', String(deals.length), 'No período seleccionado'], ['Trabalhos pagos', String(done.length), 'Pagamento libertado'], ['Receita bruta', formatMoney(creatorMoney(gross)), 'Antes das taxas'], ['Taxas', formatMoney(creatorMoney(fees)), 'Parte do criador']].map(([label, value, note]) => <div key={label} className="min-w-0 rounded-[20px] border border-line bg-surface p-[13px]"><Rotulo>{label}</Rotulo><p className="algarismos mt-1 text-[19px] font-[1000] tracking-[-.03em]">{value}</p><p className="mt-0.5 text-[11px] font-bold text-dim">{note}</p></div>)}</div>
      <div className="mt-[18px] mb-2"><Rotulo>De onde vem o dinheiro</Rotulo></div>
      {sources.size ? <div className="rounded-[24px] border border-line bg-surface p-4">{[...sources].sort((a, b) => a[1] > b[1] ? -1 : 1).map(([title, value]) => <div key={title} className="mb-4 last:mb-0"><div className="flex items-baseline justify-between gap-3 text-[12.5px] font-[900]"><span>{title}</span><span className="algarismos shrink-0">{formatMoney(creatorMoney(value))}</span></div><div className="mt-2 h-[7px] overflow-hidden rounded-full bg-surface2"><div className="h-full rounded-full bg-lime" style={{ width: revenue > 0n ? String(value * 100n / revenue) + '%' : '0%' }} /></div></div>)}</div> : <div className="rounded-[22px] border border-dashed border-line px-4 pb-5"><Vazio titulo="O teu primeiro resultado vem aí" texto="Os trabalhos pagos aparecem aqui, separados por oferta." /></div>}
      <p className="mt-3 text-center text-[10.5px] font-bold text-dim">Resultados calculados sobre os últimos 100 pedidos.</p>
    </CreatorBoundary>
  </Screen>;
}
