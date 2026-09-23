'use client';

import { useEffect, useRef, useState } from 'react';
import { CreatorBoundary, CreatorField, CreatorNotice, CreatorSwitch, creatorField } from '@/components/creator-ui';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { StudioHeader } from '@/components/studio-nav';
import { Botao, Rotulo } from '@/components/ui';
import { api } from '@/lib/api';
import { creatorMoney, editableKwanza, parseKwanza, useCreatorData, type CreatorOffer } from '@/lib/creator-api';
import { formatMoney } from '@/lib/money';

interface Form { title: string; description: string; price: string; slaHours: number; revisionsIncluded: number; requiresBrief: boolean; kind: string }
const empty: Form = { title: '', description: '', price: '3500', slaHours: 48, revisionsIncluded: 1, requiresBrief: true, kind: 'CUSTOM_SERVICE' };
export default function OfertasPage() {
  const state = useCreatorData();
  const initialSelection = useRef(false);
  const [offers, setOffers] = useState<CreatorOffer[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  useEffect(() => {
    if (!state.userId) return;
    let active = true;
    api<{ offers: CreatorOffer[] }>('/profiles/me/offers', { actorUserId: state.userId }).then((result) => { if (active) { const available = result.offers.filter((offer) => offer.status !== 'ARCHIVED'); setOffers(available); if (!initialSelection.current) { initialSelection.current = true; if (available[0]) pick(available[0]); } } }).catch((cause: unknown) => { if (active) setFeedback({ message: cause instanceof Error ? cause.message : 'Não foi possível abrir as ofertas.', error: true }); });
    return () => { active = false; };
  }, [state.userId, state.data]);
  function pick(offer: CreatorOffer) {
    setSelected(offer.id); setForm({ title: offer.title, description: offer.description ?? '', price: editableKwanza(offer.price.amount), slaHours: offer.slaHours, revisionsIncluded: offer.revisionsIncluded, requiresBrief: offer.requiresBrief, kind: offer.kind }); setFeedback(null);
  }
  async function save(status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED') {
    if (!state.userId || saving) return;
    const priceMinor = parseKwanza(form.price);
    if (!status && (!priceMinor || form.title.trim().length < 2)) { setFeedback({ message: 'Preenche o título e um preço válido.', error: true }); return; }
    setSaving(true); setFeedback(null);
    try {
      const body = status ? { status } : { title: form.title.trim(), description: form.description.trim() || undefined, priceMinor, slaHours: form.slaHours, revisionsIncluded: form.revisionsIncluded, requiresBrief: form.requiresBrief, ...(!selected ? { kind: form.kind } : {}) };
      const result = await api<CreatorOffer>(selected ? `/profiles/me/offers/${selected}` : '/profiles/me/offers', { method: selected ? 'PATCH' : 'POST', actorUserId: state.userId, body });
      if (status === 'ARCHIVED') { setSelected(null); setForm(empty); } else pick(result);
      setFeedback({ message: status === 'ARCHIVED' ? 'Oferta arquivada. Os pedidos existentes não mudaram.' : status === 'PAUSED' ? 'Oferta pausada. Já não recebe novos pedidos.' : 'Oferta guardada no teu perfil.' });
      state.reload();
    } catch (cause) { setFeedback({ message: cause instanceof Error ? cause.message : 'Não foi possível guardar.', error: true }); }
    finally { setSaving(false); }
  }
  const current = offers.find((offer) => offer.id === selected);
  const amount = parseKwanza(form.price);
  return <Screen header={<StudioHeader titulo={current?.title ?? 'Nova oferta'} subtitulo={current ? 'Preço, prazo e o que entregas' : 'Prepara a tua próxima oferta'} accao={<button type="button" onClick={() => { setSelected(null); setForm(empty); setFeedback(null); }} className="h-8 shrink-0 rounded-full border border-line px-3 text-[12px] font-[900]">+ Nova</button>} />} footer={state.data && <><Botao bloco onClick={() => void save()} disabled={saving || form.title.trim().length < 2 || !amount}>{saving ? 'A guardar…' : selected ? 'Guardar alterações' : 'Criar oferta'}</Botao>{current && <button type="button" disabled={saving} onClick={() => void save(current.status === 'PAUSED' ? 'ACTIVE' : 'PAUSED')} className="mt-1 min-h-11 w-full rounded-full text-[13px] font-[900] text-dim">{current.status === 'PAUSED' ? 'Voltar a activar' : 'Pausar esta oferta'}</button>}</>}>
    <CreatorBoundary {...state} loading={!state.data} retry={state.reload}>
      {offers.length > 0 && <label className="mb-3 block"><span className="sr-only">Oferta a editar</span><select className={`${creatorField} !rounded-full !py-2.5 text-[12px]`} value={selected ?? ''} onChange={event => { const offer = offers.find(item => item.id === event.target.value); if (offer) pick(offer); else { setSelected(null); setForm(empty); setFeedback(null); } }}><option value="">+ Nova oferta</option>{offers.map(offer => <option key={offer.id} value={offer.id}>{offer.title} · {offer.status === 'PAUSED' ? 'Pausada' : offer.status === 'DRAFT' ? 'Rascunho' : 'Activa'}</option>)}</select></label>}
      <section className="mb-[18px] rounded-[26px] border border-line bg-surface p-[15px]"><div className="flex items-center justify-between"><Rotulo>Preço da oferta</Rotulo><Icon name="tag" className="size-[18px] text-lime-text" /></div><label className="mt-2 flex items-baseline gap-2"><span className="sr-only">Preço em Kz</span><input inputMode="decimal" value={form.price} onChange={event => setForm({ ...form, price: event.target.value })} className="algarismos w-0 min-w-0 flex-1 border-0 bg-transparent text-[30px] font-[1000] tracking-[-.04em] outline-none focus-visible:ring-2 focus-visible:ring-lime" /><span className="text-[18px] font-[900] text-dim">Kz</span></label><p className="mt-1 text-[11px] font-bold text-dim">Por pedido · taxas confirmadas no pagamento</p><div className="mt-[14px] flex gap-1.5 border-t border-line pt-[14px]">{['3500', '7500', '18000'].map(price => <button type="button" key={price} aria-pressed={form.price === price} onClick={() => setForm({ ...form, price })} className={`h-[34px] flex-1 rounded-full text-[11.5px] font-[900] ${form.price === price ? 'bg-lime text-lime-ink' : 'border border-line text-dim'}`}>{formatMoney(creatorMoney(parseKwanza(price)!))}</button>)}</div></section>
      <Rotulo>{selected ? 'Editar oferta' : 'Nova oferta'}</Rotulo>
      {!selected && <CreatorField label="Tipo de oferta"><select className={creatorField} value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}><option value="CUSTOM_SERVICE">Serviço personalizado</option><option value="DIRECT_MESSAGE">Resposta por mensagem</option><option value="BOOKING">Chamada / marcação</option></select></CreatorField>}
      <CreatorField label="Título"><input className={creatorField} maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ex.: Resposta em vídeo" /></CreatorField>
      <CreatorField label="O que inclui"><textarea className={creatorField} rows={3} maxLength={1000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Explica o que vais entregar e os direitos de utilização." /></CreatorField>
      <div className="mt-[18px] mb-2"><Rotulo>Prazo e alterações</Rotulo></div><div className="rounded-[26px] border border-line bg-surface px-[15px] py-1"><Counter label="Prazo prometido" value={form.slaHours} unit="horas" min={1} max={720} onChange={(slaHours) => setForm({ ...form, slaHours })} /><Counter label="Alterações incluídas" value={form.revisionsIncluded} min={0} max={10} onChange={(revisionsIncluded) => setForm({ ...form, revisionsIncluded })} /><CreatorSwitch label="Pedir briefing" note="O comprador descreve o pedido antes de pagar." checked={form.requiresBrief} onChange={(requiresBrief) => setForm({ ...form, requiresBrief })} /></div>
      <div className="mt-5"><Rotulo>Como aparece na conversa</Rotulo><div className="mt-2 rounded-[22px] border border-dashed border-line p-4"><p className="text-[14px] font-[900]">{form.title || 'Título da oferta'}</p><div className="mt-2 flex justify-between text-[12px] font-[800]"><span className="text-dim">Entrega em {form.slaHours}h</span><span>{amount ? formatMoney(creatorMoney(amount)) : 'Define o preço'}</span></div></div></div>
      {feedback && <CreatorNotice error={feedback.error}>{feedback.message}</CreatorNotice>}
      {current?.status === 'PAUSED' && <button type="button" disabled={saving} onClick={() => { if (window.confirm('Arquivar esta oferta? Os pedidos já criados continuam disponíveis.')) void save('ARCHIVED'); }} className="mt-4 min-h-11 w-full rounded-full border border-danger text-[13px] font-[900] text-danger">Arquivar oferta</button>}
    </CreatorBoundary>
  </Screen>;
}
function Counter({ label, value, onChange, min, max, unit = '' }: { label: string; value: number; onChange: (value: number) => void; min: number; max: number; unit?: string }) {
  return <div className="flex items-center justify-between gap-3 border-b border-line py-3"><span className="text-[13px] font-[900]">{label}</span><div className="flex items-center gap-2"><button type="button" aria-label={`Diminuir ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)} className="size-11 rounded-full border border-line disabled:opacity-30">−</button><span className="algarismos text-[12px] font-[900]">{value} {unit}</span><button type="button" aria-label={`Aumentar ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)} className="size-11 rounded-full bg-lime font-black text-lime-ink disabled:opacity-30">+</button></div></div>;
}
