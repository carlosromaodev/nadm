'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Flor } from '@/components/flor';
import { Screen } from '@/components/screen';
import { Icon } from '@/components/icon';
import { Botao, LinkBotao, Painel } from '@/components/ui';
import { api, ApiError, type PublicProfile } from '@/lib/api';
import { formatMoney } from '@/lib/money';
import { safeNext } from '@/lib/navigation';
import { useSession } from '@/lib/session';

type Step = 'tipo' | 'link' | 'perfil' | 'oferta' | 'recebimento' | 'identidade' | 'avisos';
type Draft = { creator: boolean | null; handle: string; name: string; bio: string; offer: number; notices: boolean };
const EMPTY: Draft = { creator: null, handle: '', name: '', bio: '', offer: 0, notices: true };
const OFFERS = [
  { title: 'Resposta em vídeo', priceMinor: '1800000', slaHours: 48 },
  { title: 'Mensagem de voz', priceMinor: '350000', slaHours: 24 },
  { title: 'Consultoria personalizada', priceMinor: '4500000', slaHours: 72 },
];
const RESERVED = ['api','admin','estudio','deals','wallet','entrar','criar-perfil','inicio','descobrir','conversas','meu','notificacoes','seguranca','marca','eventos','denunciar','nadm','pro'];
const FIELD = 'mt-2 w-full rounded-[18px] border border-line bg-wash px-4 py-3 text-base font-extrabold placeholder:text-dim';

export default function CriarPerfilPage() {
  const router = useRouter();
  const { userId, setUserId, refreshProfile, setMode } = useSession();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState<Step>('tipo');
  const [express, setExpress] = useState('');
  const [availability, setAvailability] = useState<'idle'|'checking'|'free'|'taken'|'error'>('idle');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [savedProfile, setSavedProfile] = useState(false);
  const [savedOffer, setSavedOffer] = useState(false);
  const [next, setNext] = useState('/');
  const key = 'nadm.onboarding.' + (userId ?? 'new');
  const sequence: Step[] = draft.creator ? ['tipo','link','perfil','oferta','recebimento','identidade','avisos'] : ['tipo','perfil','avisos'];
  const index = sequence.indexOf(step);
  const validHandle = /^[a-z][a-z0-9_]{2,29}$/.test(draft.handle) && !RESERVED.includes(draft.handle);
  function patch(value: Partial<Draft>) { setDraft(current => ({ ...current, ...value })); }

  useEffect(() => {
    try {
      const value = localStorage.getItem(key);
      if (value) setDraft({ ...EMPTY, ...JSON.parse(value) });
      else if (new URLSearchParams(window.location.search).get('role') === 'creator') patch({ creator: true });
    } catch { /* A corrupt optional draft never prevents onboarding. */ }
    setNext(safeNext(new URLSearchParams(window.location.search).get('next')));
    setHydrated(true);
  // Load once: setting a new user during saving must not erase the form.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (hydrated) try { localStorage.setItem(key, JSON.stringify(draft)); } catch { /* Keep the form in memory. */ }
  }, [draft, hydrated, key]);
  useEffect(() => {
    if (!validHandle) { setAvailability('idle'); return; }
    let live = true;
    setAvailability('checking');
    const timer = setTimeout(() => {
      void api<PublicProfile>('/profiles/' + draft.handle).then(() => { if (live) setAvailability('taken'); }).catch(reason => {
        if (live) setAvailability(reason instanceof ApiError && reason.status === 404 ? 'free' : 'error');
      });
    }, 350);
    return () => { live = false; clearTimeout(timer); };
  }, [draft.handle, validHandle]);

  const canContinue = step === 'tipo' ? draft.creator !== null : step === 'link' ? validHandle && availability === 'free' : step === 'perfil' ? draft.name.trim().length >= 2 : step === 'recebimento' ? !express || /^9\d{8}$/.test(express) : true;
  async function finish() {
    if (saving) return;
    setSaving(true); setError('');
    let actor = userId;
    try {
      if (!actor) {
        const session = await api<{ userId: string; displayName: string }>('/dev/session', { method: 'POST', body: { displayName: draft.name.trim(), role: draft.creator ? 'CREATOR' : 'BUYER' } });
        actor = session.userId;
        setUserId(actor);
      }
      if (draft.creator) {
        if (!savedProfile) {
          try { await api('/profiles', { method: 'POST', actorUserId: actor, body: { handle: draft.handle, displayName: draft.name.trim(), bio: draft.bio } }); }
          catch (reason) {
            if (!(reason instanceof ApiError && reason.status === 409)) throw reason;
            const own = await api<PublicProfile>('/profiles/me', { actorUserId: actor });
            if (own.handle !== draft.handle) throw reason;
          }
          setSavedProfile(true);
        }
        if (!savedOffer) {
          const existing = await api<PublicProfile>('/profiles/me', { actorUserId: actor });
          if (!existing.offers.length) await api('/offers', { method: 'POST', actorUserId: actor, body: { ...OFFERS[draft.offer], requiresBrief: true, revisionsIncluded: 1 } });
          setSavedOffer(true);
        }
        await api('/profiles/me', { method: 'PATCH', actorUserId: actor, body: { settings: { notifications: draft.notices, ...(express ? { expressPhone: '+244' + express } : {}) } } });
      }
      try {
        localStorage.setItem('nadm.display-name', draft.name.trim());
        localStorage.setItem('nadm.notifications.' + actor, JSON.stringify(draft.notices));
        localStorage.removeItem(key); localStorage.removeItem('nadm.onboarding.new');
      } catch { /* API writes have already succeeded. */ }
      setMode(draft.creator ? 'creator' : 'buyer');
      refreshProfile(); setDone(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível guardar. Tenta novamente.');
    } finally { setSaving(false); }
  }

  if (done) return <Screen footer={<Botao bloco onClick={() => router.push(next !== '/' ? next : draft.creator ? '/estudio' : '/inicio')}>{draft.creator ? 'Abrir o meu painel' : 'Entrar na NaDM'}</Botao>}>
    <div className="pt-14 text-center"><Flor className="anima-carimbo mx-auto size-20" /><h1 className="mt-6 text-[28px] font-[1000]">{draft.creator ? 'O teu NaDM está pronto' : 'Estás dentro'}</h1><p className="mt-3 text-sm font-bold text-dim">{draft.creator ? 'O perfil e a primeira oferta ficaram guardados.' : 'Já podes descobrir criadores e acompanhar os teus pedidos.'}</p>{draft.creator ? <LinkBotao href={'/' + draft.handle} variante="secundario" className="mt-6">Ver o meu perfil</LinkBotao> : null}</div>
  </Screen>;

  return <Screen header={<><div className="flex items-center gap-3"><button className="icon-button" aria-label="Voltar" disabled={saving} onClick={() => { if (index > 0) { setStep(sequence[index - 1]); setError(''); } else router.push('/entrar'); }}><Icon name="back" className="size-4" /></button><div className="flex-1"><h1 className="text-[14px] font-[900]">Criar perfil</h1><p className="algarismos text-[11.5px] font-bold text-dim">Passo {index + 1} de {sequence.length}</p></div></div><div className="mt-[11px] flex gap-1" aria-label={`Passo ${index + 1} de ${sequence.length}`}>{sequence.map((item, i) => <span key={item} className={`h-[5px] flex-1 rounded-full ${i <= index ? 'bg-lime' : 'bg-surface2'}`} />)}</div></>} contentClassName="!px-[18px] !pt-2" footer={<><Botao bloco disabled={!canContinue || saving} onClick={() => index === sequence.length - 1 ? void finish() : setStep(sequence[index + 1])}>{saving ? 'A guardar…' : index === sequence.length - 1 ? 'Criar a minha conta de teste' : 'Continuar'}</Botao><p className="mt-2 text-center text-[11px] font-bold text-dim">Podes guardar e continuar depois.</p></>}>
    {error ? <p role="alert" className="my-3 rounded-[18px] border border-danger p-3 text-sm text-danger">{error}</p> : null}
    {step === 'tipo' ? <><Title>O que vens cá fazer?</Title><p className="mt-[7px] max-w-[32ch] text-[13px] font-bold leading-[1.5] text-dim">Escolhe como queres começar na NaDM.</p><div className="mt-5 space-y-[9px]">{[{ creator: true, title: 'Vender o meu trabalho', note: 'Receber pedidos, publicar conteúdo e ganhar com o que crias.' }, { creator: false, title: 'Ver e apoiar criadores', note: 'Comprar conteúdo, fazer pedidos e conversar.' }].map(option => <button key={option.title} aria-pressed={draft.creator === option.creator} onClick={() => patch({ creator: option.creator })} className={'flex w-full items-center gap-3 rounded-[24px] border p-[15px] text-left ' + (draft.creator === option.creator ? 'border-lime-text bg-surface2' : 'border-line bg-surface')}><span className="flex size-11 shrink-0 items-center justify-center rounded-[15px] bg-wash text-lime-text"><Icon name={option.creator ? 'sparkle' : 'user'} className="size-[19px]" /></span><span className="min-w-0 flex-1"><span className="block text-[15.5px] font-[1000] tracking-[-.02em]">{option.title}</span><span className="mt-[3px] block text-[12px] font-bold leading-[1.45] text-dim">{option.note}</span></span><span className={`size-5 shrink-0 rounded-full border-2 ${draft.creator === option.creator ? 'border-lime-text bg-lime shadow-[inset_0_0_0_4px_var(--color-surface2)]' : 'border-line'}`} /></button>)}</div><p className="mt-3.5 text-[11.5px] font-bold leading-[1.45] text-dim">Podes mudar depois. Quem vende começa por receber pedidos na DM, sem ter de publicar nada.</p></> : null}
    {step === 'link' ? <><Title>O teu endereço</Title><p className="mt-2 text-sm font-bold text-dim">É o link que vai para a tua bio.</p><label className="mt-5 block text-sm font-black">Nome do perfil<input className={FIELD} value={draft.handle} onChange={event => patch({ handle: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0,30) })} placeholder="oteunome" autoComplete="username" /></label><p role="status" className={'mt-3 text-sm font-bold ' + (availability === 'taken' || !validHandle ? 'text-danger' : 'text-lime-text')}>{!draft.handle ? 'Entre 3 e 30 caracteres, a começar por uma letra.' : !validHandle ? 'Este endereço é inválido ou está reservado.' : availability === 'checking' ? 'A verificar disponibilidade…' : availability === 'free' ? 'Disponível: /' + draft.handle : availability === 'taken' ? 'Este nome já está ocupado. Experimenta acrescentar a tua área.' : 'Não conseguimos verificar a ligação. Tenta de novo.'}</p></> : null}
    {step === 'perfil' ? <><Title>{draft.creator ? 'Dá a tua cara ao perfil' : 'Como te chamas?'}</Title><div className="my-5 flex items-center gap-4"><span className="flex size-20 items-center justify-center rounded-full border border-line bg-surface2 text-3xl font-black">{draft.name.slice(0,1).toUpperCase() || <Flor className="size-10 opacity-50" />}</span><p className="max-w-[22ch] text-xs font-bold text-dim">Podes personalizar a tua apresentação no editor do perfil.</p></div><label className="block text-sm font-black">Nome<input className={FIELD} value={draft.name} onChange={event => patch({ name: event.target.value.slice(0,80) })} autoComplete="name" placeholder="O teu nome" /></label>{draft.creator ? <label className="mt-4 block text-sm font-black">A tua bio<textarea className={FIELD} value={draft.bio} onChange={event => patch({ bio: event.target.value.slice(0,500) })} rows={3} placeholder="O que crias e o que podem pedir-te" /><span className="mt-1 block text-right text-xs text-dim">{draft.bio.length}/500</span></label> : null}</> : null}
    {step === 'oferta' ? <><Title>A tua primeira oferta</Title><p className="mt-2 text-sm font-bold text-dim">Escolhe algo que consigas entregar. Podes editar depois.</p><div className="mt-5 space-y-3">{OFFERS.map((offer, i) => <button key={offer.title} onClick={() => patch({ offer: i })} aria-pressed={draft.offer === i} className={'flex w-full items-center justify-between gap-3 rounded-[24px] border p-4 text-left ' + (draft.offer === i ? 'border-lime-text bg-surface2' : 'border-line bg-surface')}><span className="font-black">{offer.title}<span className="mt-1 block text-xs text-dim">{offer.slaHours}h · 1 alteração</span></span><span className="shrink-0 text-sm font-black text-lime-text">{formatMoney({ amount: offer.priceMinor, currency: 'AOA' })}</span></button>)}</div><p className="mt-4 text-xs leading-relaxed text-dim">Taxa de 5% para o comprador e 5% descontados ao criador. Os valores finais aparecem no pedido antes de pagar.</p></> : null}
    {step === 'recebimento' ? <><Title>Onde recebes</Title><p className="mt-2 text-sm font-bold text-dim">O teu número Express é privado. O levantamento real só fica disponível depois de a integração e a identidade estarem verificadas.</p><label className="mt-5 block text-sm font-black">Número Express · opcional<div className="mt-2 flex items-center gap-3 rounded-full border border-line bg-wash px-4 py-3"><span>+244</span><input value={express} onChange={event => setExpress(event.target.value.replace(/\D/g, '').slice(0,9))} inputMode="tel" type="tel" placeholder="923 000 000" className="min-w-0 flex-1 bg-transparent py-1 text-base" /></div></label><p className="mt-3 text-xs text-dim">Podes deixar em branco enquanto testas a aplicação.</p></> : null}
    {step === 'identidade' ? <><Title>A tua identidade fica privada</Title><Painel className="mt-5"><Flor className="size-10" /><h2 className="mt-3 text-lg font-black">Ainda não verificada</h2><p className="mt-2 text-sm leading-relaxed text-dim">A verificação por BI e selfie precisa do serviço de identidade. Não envies documentos reais neste ambiente de demonstração.</p></Painel><p className="mt-4 text-sm font-bold text-dim">Podes continuar a testar o perfil. Esta etapa não confirma a identidade nem desbloqueia levantamentos.</p></> : null}
    {step === 'avisos' ? <><Title>Não percas o que importa</Title><p className="mt-2 text-sm font-bold text-dim">Pedidos, mensagens e novidades dos criadores, no mesmo lugar.</p><label className="mt-5 flex min-h-20 items-center justify-between gap-4 rounded-[24px] border border-line bg-surface p-4"><span className="font-black">Avisos na aplicação<span className="mt-1 block text-xs font-bold text-dim">Podes mudar nas definições.</span></span><input type="checkbox" checked={draft.notices} onChange={event => patch({ notices: event.target.checked })} className="size-6 accent-[var(--color-lime)]" /></label><p className="mt-4 text-xs leading-relaxed text-dim">Não enviamos SMS, email ou push nesta demonstração. Esta escolha guarda a tua preferência.</p></> : null}
  </Screen>;
}
function Title({ children }: { children: React.ReactNode }) { return <h2 className="max-w-[22ch] text-[23px] leading-[1.15] font-[1000] tracking-[-.04em]">{children}</h2>; }
