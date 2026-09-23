'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CreatorBoundary, CreatorNotice, creatorLink } from '@/components/creator-ui';
import { Flor } from '@/components/flor';
import { Screen } from '@/components/screen';
import { StudioHeader } from '@/components/studio-nav';
import { Pastilha, Rotulo } from '@/components/ui';
import { useCreatorData } from '@/lib/creator-api';

export default function ProPage() {
  const state = useCreatorData();
  const [period, setPeriod] = useState<'monthly' | 'annual'>('monthly');
  return <Screen header={<StudioHeader voltarPara="/estudio/perfil" titulo="NaDM Pro" subtitulo="O plano da plataforma para criadores" accao={<Pastilha tom="espera">Em preparação</Pastilha>} />} footer={<Link href="/estudio/ofertas" className={`${creatorLink} w-full`}>Continuar com as minhas ofertas</Link>}>
    <CreatorBoundary {...state} loading={!state.data} retry={state.reload}>
      <div className="grid grid-cols-2 gap-2">{([['monthly', 'Mensal'], ['annual', 'Anual']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={period === value} onClick={() => setPeriod(value)} className={`min-h-12 rounded-[20px] px-4 text-[13px] font-[900] ${period === value ? 'bg-lime text-lime-ink' : 'border border-line bg-surface text-dim'}`}>{label}</button>)}</div>
      <div className="relative mt-3 overflow-hidden rounded-[30px] bg-lime p-5 text-lime-ink"><Flor className="pointer-events-none absolute -right-7 -bottom-8 size-36 opacity-15" fill="var(--color-lime-ink)" /><div className="relative"><span className="text-[10px] font-[800] uppercase tracking-widest opacity-70">{period === 'monthly' ? 'Pro mensal' : 'Pro anual'}</span><p className="mt-3 text-[32px] font-[1000] tracking-tight">Mais espaço para criar.</p><p className="mt-2 text-[13px] font-[800] leading-relaxed opacity-80">Preço e condições serão confirmados antes da subscrição. Ainda não é possível activar ou cobrar este plano.</p></div></div>
      <div className="mt-5 mb-2"><Rotulo>O que o plano prevê</Rotulo></div>
      <div className="overflow-hidden rounded-[24px] border border-line bg-surface"><div className="grid grid-cols-[1fr_60px_60px] gap-2 border-b border-line px-4 py-3 text-[11px] font-[900] text-dim"><span>Benefício</span><span className="text-center">Grátis</span><span className="text-center text-lime-text">Pro</span></div>{[['Preços por escalões', 'Sim', 'Sim'], ['Preços personalizados', '—', 'Previsto'], ['Painel e pedidos', 'Sim', 'Sim'], ['Análises avançadas', '—', 'Previsto'], ['Ferramentas de organização', 'Base', 'Mais']].map(([label, free, pro]) => <div key={label} className="grid grid-cols-[1fr_60px_60px] items-center gap-2 border-b border-line px-4 py-4 last:border-0"><span className="text-[13px] font-[900]">{label}</span><span className="text-center text-[11px] font-[800] text-dim">{free}</span><span className="text-center text-[11px] font-[900] text-lime-text">{pro}</span></div>)}</div>
      <CreatorNotice>NaDM Pro e adesões de fãs são produtos diferentes. Esta página não activa preços livres, altera taxas dos pedidos nem cria uma renovação automática. As condições em vigor continuam a ser as apresentadas em cada pedido.</CreatorNotice>
    </CreatorBoundary>
  </Screen>;
}
