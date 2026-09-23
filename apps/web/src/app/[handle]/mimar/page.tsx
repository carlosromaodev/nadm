'use client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { AppSheet } from '@/components/app-sheet';
import { Flor } from '@/components/flor';
import { Icon } from '@/components/icon';
import { Screen, TituloComVolta } from '@/components/screen';
import { ACarregar } from '@/components/states';
import { Botao, Rotulo } from '@/components/ui';
import { LoadError } from '@/components/viewer-ui';
import { formatMoney } from '@/lib/money';
import { estimateMimo, MIMO_AMOUNTS } from '@/lib/mimo';
import { useResource, type ViewerProfile } from '@/lib/viewer-data';

export default function MimoPage() {
  const { handle } = useParams<{ handle: string }>();
  const profile = useResource<ViewerProfile>(`/profiles/${encodeURIComponent(handle)}`);
  const [amount, setAmount] = useState<string>('500000');
  const [message, setMessage] = useState('');
  const [publicName, setPublicName] = useState(true);
  const [review, setReview] = useState(false);
  const estimate = estimateMimo(amount);
  if (profile.error) return <Screen header={<TituloComVolta voltarPara={'/' + handle} titulo="Mimar" />}><LoadError message={profile.error} retry={profile.retry} /></Screen>;
  if (!profile.data) return <ACarregar />;
  const name = profile.data.displayName;
  return <Screen header={<TituloComVolta voltarPara={'/' + handle + '/dm'} titulo={'Mimar ' + name} subtitulo="Apoio livre · sem entrega" />} footer={<><Botao bloco onClick={() => setReview(true)}>Rever mimo · {formatMoney(estimate.total)}</Botao><p className="mt-2 text-center text-[11px] font-bold text-dim">Pré-visualização · pagamentos de mimos indisponíveis</p></>}>
    <section className="wallet-highlight relative overflow-hidden rounded-[30px] p-5 text-lime-ink"><Flor className="pointer-events-none absolute -right-[26px] -bottom-8 size-[152px] opacity-[.18]" fill="var(--color-lime-ink)" /><div className="relative flex items-center gap-[11px]"><span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-lime-ink/25 bg-lime-ink/10 text-[18px] font-[1000]">{name.slice(0, 1)}</span><div><p className="text-[9.5px] font-extrabold uppercase tracking-[.14em] opacity-70">Para</p><p className="mt-0.5 text-[16px] font-[1000]">{name}</p></div></div><div className="relative mt-[18px] flex items-baseline gap-[7px]"><span className="algarismos text-[40px] leading-none font-[1000] tracking-[-.05em]">{formatMoney(estimate.price).replace(/\s*Kz$/, '')}</span><span className="text-[15px] font-[900] opacity-75">Kz</span></div><p className="relative mt-[5px] text-[12px] font-bold opacity-80">{BigInt(amount) >= 2500000n ? 'é muito dinheiro em Luanda — obrigado' : BigInt(amount) >= 1000000n ? 'dá para uma sessão de material' : 'todo o apoio conta'}</p></section>
    <div className="mt-5 mb-2"><Rotulo>Quanto queres dar</Rotulo></div><div className="grid grid-cols-3 gap-[7px]">{MIMO_AMOUNTS.map(value => <button key={value} onClick={() => setAmount(value)} aria-pressed={value === amount} className={`flex h-[58px] flex-col items-center justify-center rounded-[20px] ${value === amount ? 'bg-lime text-lime-ink' : 'border border-line bg-surface'}`}><span className="algarismos text-[15px] font-[1000]">{formatMoney({ amount: value, currency: 'AOA' }).replace(/\s*Kz$/, '')}</span><span className="mt-0.5 text-[9.5px] font-bold opacity-75">{value === '500000' ? 'Kz · sugestão' : 'Kz'}</span></button>)}</div>
    <label className="mt-5 mb-2 block" htmlFor="mimo-message"><Rotulo>Deixar uma palavra</Rotulo></label><div className="rounded-[22px] border border-line bg-surface p-3.5"><textarea id="mimo-message" rows={2} maxLength={200} value={message} onChange={event => setMessage(event.target.value)} placeholder="Uma palavra de apoio…" className="w-full resize-none bg-transparent text-[13.5px] leading-[1.5] font-bold placeholder:text-dim" /><div className="mt-[11px] flex items-center justify-between gap-2 border-t border-line pt-[11px]"><div className="flex gap-1.5">{[true, false].map(value => <button key={String(value)} onClick={() => setPublicName(value)} aria-pressed={value === publicName} className={`h-8 rounded-full px-3 text-[10.5px] font-[900] ${value === publicName ? 'bg-lime text-lime-ink' : 'border border-line text-dim'}`}>{value ? 'Público' : 'Só para o criador'}</button>)}</div><span className="algarismos shrink-0 text-[10.5px] font-extrabold text-dim">{message.length} / 200</span></div></div>
    <p className="mt-3 flex gap-2.5 rounded-[20px] border border-line bg-wash p-[13px] text-[11.5px] font-bold leading-[1.45] text-dim"><Icon name="sparkle" className="mt-px size-4 text-lime-text" />Mimar não é encomendar: não há prazo, entrega ou alterações. É só dizer obrigado com dinheiro.</p>
    {review && <AppSheet title="Rever o mimo" onClose={() => setReview(false)}><dl className="space-y-3">{[['Mimo', estimate.price], ['Taxa do comprador (5%)', estimate.buyerFee], ['Total previsto', estimate.total], ['O criador recebe (menos 5%)', estimate.creatorNet]].map(([label, money]) => <div key={String(label)} className="flex items-center justify-between gap-3 text-[12.5px] font-bold"><dt className="text-dim">{String(label)}</dt><dd className="algarismos shrink-0 font-[1000]">{formatMoney(money as typeof estimate.price)}</dd></div>)}</dl>{message && <p className="mt-4 whitespace-pre-wrap break-words rounded-[18px] border border-line p-3 text-[12px] font-bold">{message}<span className="mt-2 block text-[10.5px] text-dim">{publicName ? 'Visibilidade escolhida: pública' : 'Visibilidade escolhida: só para o criador'}</span></p>}<p role="status" className="mt-4 text-[12px] font-bold leading-relaxed text-dim">Esta é uma estimativa do protótipo. O envio de mimos ainda não está ligado ao pagamento. Nada foi cobrado nem enviado.</p><Botao bloco className="mt-5" onClick={() => setReview(false)}>Voltar a editar</Botao></AppSheet>}
  </Screen>;
}
