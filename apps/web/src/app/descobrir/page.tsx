'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Screen } from '@/components/screen';
import { Icon, type IconName } from '@/components/icon';
import { ACarregar } from '@/components/states';
import { Rotulo, Vazio } from '@/components/ui';
import { Chip, LoadError, ProfileCard } from '@/components/viewer-ui';
import { useLocalSelection, useResource, type ViewerProfile } from '@/lib/viewer-data';

const CATEGORIES: { name: string; icon: IconName }[] = [
  { name: 'Beleza e estilo', icon: 'sparkle' }, { name: 'Música', icon: 'music' },
  { name: 'Humor', icon: 'smile' }, { name: 'Comida', icon: 'food' },
  { name: 'Desporto', icon: 'fitness' }, { name: 'Empresas', icon: 'briefcase' },
];

export default function DiscoverPage() { return <Suspense fallback={<ACarregar />}><Discover /></Suspense>; }

function Discover() {
  const router = useRouter();
  const search = useSearchParams();
  const query = search.get('q') ?? '';
  const category = search.get('category') ?? '';
  const available = search.get('available') === '1';
  const affordable = search.get('affordable') === '1';
  const luanda = search.get('city') === 'Luanda';
  const video = search.get('video') === '1';
  const brands = search.get('brands') === '1';
  const [input, setInput] = useState(query);
  const recent = useLocalSelection('recent-searches');
  const results = useResource<{ profiles: ViewerProfile[] }>(`/profiles${query ? `?q=${encodeURIComponent(query)}` : ''}`);
  useEffect(() => setInput(query), [query]);

  function setFilter(name: string, value: string) {
    const next = new URLSearchParams(search.toString());
    if (value) next.set(name, value); else next.delete(name);
    router.replace(`/descobrir${next.size ? `?${next}` : ''}`, { scroll: false });
  }

  useEffect(() => {
    if (input.trim() === query) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(search.toString());
      if (input.trim()) next.set('q', input.trim()); else next.delete('q');
      router.replace(`/descobrir${next.size ? `?${next}` : ''}`, { scroll: false });
    }, 300);
    return () => clearTimeout(timer);
  }, [input, query, router, search]);

  const all = results.data?.profiles ?? [];
  const categories = [...CATEGORIES, ...[...new Set(all.map(profile => profile.category).filter((value): value is string => Boolean(value)))].filter(name => !CATEGORIES.some(item => item.name === name)).map(name => ({ name, icon: 'tag' as const }))];
  const filtered = all.filter((profile) => (!category || profile.category === category)
    && (!available || profile.availabilityStatus === 'AVAILABLE')
    && (!affordable || profile.offers.some((offer) => BigInt(offer.price.amount) <= 1000000n))
    && (!luanda || profile.location?.toLocaleLowerCase('pt').includes('luanda'))
    && (!video || profile.offers.some(offer => /v[ií]deo/i.test(offer.title + ' ' + (offer.description ?? ''))))
    && (!brands || profile.acceptsBrands));

  return <Screen header={<>
    <h1 className="sr-only">Descobrir criadores</h1>
    <form onSubmit={event => { event.preventDefault(); setFilter('q', input.trim()); if (input.trim()) recent.update([input.trim(), ...recent.values.filter(value => value !== input.trim())].slice(0, 5)); }} className={`flex h-12 items-center gap-[9px] rounded-full border-[1.5px] bg-wash px-4 ${query ? 'border-lime-text' : 'border-line'}`}>
      <Icon name="search" className="size-[17px] text-dim" />
      <input value={input} onChange={event => setInput(event.target.value)} placeholder="Procurar criador, categoria ou cidade" aria-label="Procurar criadores" className="min-w-0 flex-1 bg-transparent py-3 text-[13.5px] font-bold placeholder:text-dim" />
      {input && <button type="button" aria-label="Limpar pesquisa" className="flex size-7 items-center justify-center rounded-full bg-surface2" onClick={() => { setInput(''); setFilter('q', ''); }}><Icon name="close" className="size-3" /></button>}
    </form>
    <div className="rolo -mx-4 mt-[11px] flex gap-1.5 px-4 pb-0.5">
      <Chip selected={available} onClick={() => setFilter('available', available ? '' : '1')}>Responde hoje</Chip>
      <Chip selected={affordable} onClick={() => setFilter('affordable', affordable ? '' : '1')}>Até 10 000 Kz</Chip>
      <Chip selected={luanda} onClick={() => setFilter('city', luanda ? '' : 'Luanda')}>Luanda</Chip>
      <Chip selected={video} onClick={() => setFilter('video', video ? '' : '1')}>Faz vídeo</Chip>
      <Chip selected={brands} onClick={() => setFilter('brands', brands ? '' : '1')}>Aceita marcas</Chip>
      {category && <Chip selected onClick={() => setFilter('category', '')}>{category} ×</Chip>}
    </div>
  </>} contentClassName="!pt-2">
    {!query && !category && <section className="mb-[18px]"><Rotulo>Categorias</Rotulo><div className="mt-2 grid grid-cols-2 gap-2">{categories.map(({ name, icon }) => {
      const count = all.filter(profile => profile.category === name).length;
      return <button key={name} onClick={() => setFilter('category', name)} className="toque flex items-center gap-2.5 rounded-[22px] border border-line bg-surface p-[13px] text-left">
        <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[13px] bg-[color-mix(in_oklch,var(--color-lime)_14%,var(--color-surface2))] text-lime-text"><Icon name={icon} className="size-[17px]" /></span>
        <span className="min-w-0"><span className="block text-[13px] font-[900] leading-tight">{name}</span><span className="algarismos mt-0.5 block text-[10.5px] font-bold text-dim">{results.loading ? 'A carregar…' : count + (count === 1 ? ' criador' : ' criadores')}</span></span>
      </button>;
    })}</div></section>}
    {!query && recent.values.length > 0 && <section className="mb-[18px]"><Rotulo>Procuras recentes</Rotulo><div className="mt-2 flex flex-wrap gap-1.5">{recent.values.map(term => <button key={term} onClick={() => { setInput(term); setFilter('q', term); }} className="flex h-[34px] items-center gap-[7px] rounded-full border border-line px-[13px] text-[12px] font-extrabold text-dim"><Icon name="clock" className="size-[13px]" />{term}</button>)}</div></section>}
    {results.error ? <LoadError message={results.error} retry={results.retry} /> : results.loading ? <ACarregar /> : !filtered.length ? <Vazio titulo={query ? 'Ninguém com esse nome' : 'Sem resultados neste filtro'} texto="Experimenta outra pesquisa ou retira um filtro para ver mais criadores." accao={<button onClick={() => { setInput(''); router.replace('/descobrir'); }} className="min-h-11 rounded-full border border-line px-5 text-[13px] font-[900]">Limpar filtros</button>} /> : <><div className="mb-2 flex justify-between"><Rotulo>{query || category || available || affordable || luanda || video || brands ? filtered.length + ' criadores' : 'Criadores para descobrir'}</Rotulo></div><div className="adaptive-grid">{filtered.map(profile => <ProfileCard key={profile.id} profile={profile} />)}</div></>}
  </Screen>;
}
