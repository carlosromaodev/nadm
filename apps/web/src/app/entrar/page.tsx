'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppSheet } from '@/components/app-sheet';
import { Flor } from '@/components/flor';
import { Icon, type IconName } from '@/components/icon';
import { Screen } from '@/components/screen';
import { Botao } from '@/components/ui';
import { safeNext } from '@/lib/navigation';
import { useSession } from '@/lib/session';

const providers: { name: string; icon: IconName }[] = [
  { name: 'TikTok', icon: 'tiktok' }, { name: 'Facebook', icon: 'facebook' }, { name: 'Google', icon: 'google' },
];

export default function EntrarPage() {
  const router = useRouter();
  const { setUserId, setMode } = useSession();
  const [step, setStep] = useState<'choose' | 'phone'>('choose');
  const [telefone, setTelefone] = useState('');
  const [notice, setNotice] = useState('');
  const [demo, setDemo] = useState(false);
  const [next, setNext] = useState('/');
  useEffect(() => setNext(safeNext(new URLSearchParams(window.location.search).get('next'))), []);
  function unavailable(method: string) {
    setNotice(method + ' ainda não está disponível nesta demonstração. Podes explorar com uma conta de teste.');
  }
  const dialogs = <>
    {notice && <AppSheet title="Ainda não disponível" onClose={() => setNotice('')}><p className="text-[13px] font-bold leading-relaxed text-dim">{notice}</p><Botao bloco className="mt-5" onClick={() => { setNotice(''); setDemo(true); }}>Experimentar a NaDM</Botao></AppSheet>}
    {demo && <AppSheet title="Experimentar a NaDM" onClose={() => setDemo(false)}>
      <p className="mb-4 text-[12.5px] font-bold leading-relaxed text-dim">Escolhe uma conta de demonstração. Não são feitas cobranças reais.</p>
      <div className="flex flex-col gap-2">{[
        { id: '11111111-1111-4111-8111-111111111111', name: 'Entrar como criador', mode: 'creator' as const, icon: 'sparkle' as const },
        { id: '22222222-2222-4222-8222-222222222222', name: 'Entrar como espectador', mode: 'buyer' as const, icon: 'user' as const },
      ].map(person => <button key={person.id} onClick={() => { setUserId(person.id); setMode(person.mode); router.push(next === '/' ? person.mode === 'creator' ? '/estudio' : '/inicio' : next); }} className="social-button"><Icon name={person.icon} className="size-5 text-lime-text" /><span className="flex-1">{person.name}</span><Icon name="arrow" className="size-4" /></button>)}</div>
      <Link href={'/criar-perfil?next=' + encodeURIComponent(next)} className="mt-3 block py-3 text-center text-[13px] font-black text-lime-text">Criar a minha conta de teste</Link>
      <Link href="/descobrir" className="block py-3 text-center text-[13px] font-black text-dim">Explorar sem entrar</Link>
    </AppSheet>}
  </>;

  if (step === 'phone') return <Screen header={<div className="flex items-center gap-3"><button className="icon-button" aria-label="Voltar às formas de entrada" onClick={() => setStep('choose')}><Icon name="back" className="size-[17px]" /></button><h1 className="text-[14.5px] font-[900]">O teu número</h1></div>} contentClassName="!px-5" footer={<Botao form="phone-login" type="submit" bloco disabled={!/^9\d{8}$/.test(telefone)}>Receber código</Botao>}>
    <h2 className="mt-1.5 max-w-[20ch] text-[24px] leading-[1.15] font-[1000] tracking-[-.04em]">Entra com o teu número</h2>
    <p className="mt-2 max-w-[30ch] text-[13px] font-bold leading-[1.5] text-dim">Usa o número de telemóvel que queres associar à tua conta.</p>
    <form id="phone-login" onSubmit={event => { event.preventDefault(); unavailable('A entrada por SMS'); }} className="mt-[22px] flex gap-2">
      <span className="algarismos flex h-14 items-center rounded-[18px] border border-line bg-wash px-[15px] text-[15px] font-[1000]">+244</span>
      <input value={telefone} onChange={event => setTelefone(event.target.value.replace(/\D/g, '').slice(0, 9))} type="tel" inputMode="tel" autoComplete="tel-national" placeholder="923 000 000" aria-label="Número de telefone" autoFocus className="algarismos h-14 min-w-0 flex-1 rounded-[18px] border-[1.5px] border-lime-text bg-wash px-4 text-[20px] font-[900] placeholder:text-dim" />
    </form>
    <p className="mt-4 flex items-center gap-2 text-[11.5px] font-bold text-dim"><Icon name="lock" className="size-3.5" />O teu número não aparece no perfil público.</p>
    {dialogs}
  </Screen>;

  return <Screen contentClassName="login-content">
    <div className="flex flex-col items-start"><Flor className="anima-carimbo size-14" /><h1 className="mt-3.5 text-[34px] leading-none font-[1000] tracking-[-.055em]">NaDM</h1><p className="mt-2 max-w-[26ch] text-[14px] font-bold leading-[1.5] text-dim [text-wrap:pretty]">A tua DM passa a loja. Entra com a conta onde já tens público — criamos o teu perfil na mesma altura.</p></div>
    <div className="mt-[26px] flex flex-col gap-2">
      <button className="social-button primary toque" onClick={() => unavailable('A entrada com Instagram')}><Icon name="instagram" /><span className="flex-1">Continuar com Instagram</span><Icon name="arrow" className="size-4" /></button>
      <button className="social-button phone toque" onClick={() => setStep('phone')}><Icon name="phone" /><span className="flex-1">Continuar com o meu número</span><Icon name="arrow" className="size-4" /></button>
      <div className="mx-0.5 mt-3.5 mb-1.5 flex items-center gap-[11px]"><span className="h-px flex-1 bg-line" /><span className="text-[9.5px] font-extrabold uppercase tracking-[.14em] text-dim">ou</span><span className="h-px flex-1 bg-line" /></div>
      {providers.map(provider => <button key={provider.name} className="social-button toque" onClick={() => unavailable('A entrada com ' + provider.name)}><span className="flex size-[34px] items-center justify-center rounded-full bg-surface2"><Icon name={provider.icon} className="size-[17px]" /></span><span>Continuar com {provider.name}</span></button>)}
    </div>
    <div className="mt-auto pt-5">
      <div className="flex items-start gap-[9px] rounded-[18px] border border-line bg-wash px-[13px] py-3"><Icon name="lock" className="mt-px size-[15px] text-lime-text" /><p className="text-[11.5px] font-bold leading-[1.45] text-dim">Nunca publicamos nada em teu nome nem lemos as tuas mensagens.</p></div>
      <button className="mt-2 min-h-11 w-full text-[11.5px] font-extrabold text-lime-text underline decoration-lime-text/40 underline-offset-4" onClick={() => setDemo(true)}>Experimentar a demonstração</button>
    </div>
    {dialogs}
  </Screen>;
}
