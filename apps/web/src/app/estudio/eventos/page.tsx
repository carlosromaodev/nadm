'use client';

import { useEffect, useState } from 'react';
import { CreatorBoundary, CreatorField, CreatorNotice, creatorField } from '@/components/creator-ui';
import { Flor } from '@/components/flor';
import { Screen } from '@/components/screen';
import { StudioHeader } from '@/components/studio-nav';
import { Botao, Pastilha, Rotulo } from '@/components/ui';
import { creatorMoney, useCreatorData } from '@/lib/creator-api';
import { formatMoney } from '@/lib/money';

interface EventDraft { title: string; description: string; kind: 'physical' | 'online' | 'hybrid'; date: string; end: string; location: string; tickets: { id: string; title: string; capacity: number; priceMinor: string }[] }
const newEvent = (): EventDraft => ({ title: '', description: '', kind: 'physical', date: '', end: '', location: '', tickets: [{ id: 'general', title: 'Geral', capacity: 20, priceMinor: '350000' }] });
export default function EventsPage() {
  const state = useCreatorData();
  const [draft, setDraft] = useState<EventDraft>(newEvent);
  const [preview, setPreview] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  useEffect(() => {
    if (!state.userId) return;
    try { const saved = localStorage.getItem(`nadm.event-draft.${state.userId}`); if (saved) { const value = JSON.parse(saved) as EventDraft; if (typeof value.title === 'string' && Array.isArray(value.tickets)) setDraft(value); } } catch { setFeedback({ message: 'Não foi possível recuperar o rascunho deste dispositivo.', error: true }); }
  }, [state.userId]);
  function save() {
    if (!state.userId) return;
    if (draft.date && draft.end && draft.date >= draft.end) { setFeedback({ message: 'O fim do evento tem de ser posterior ao início.', error: true }); return; }
    try { localStorage.setItem(`nadm.event-draft.${state.userId}`, JSON.stringify(draft)); setFeedback({ message: 'Rascunho guardado neste dispositivo. O evento não está publicado e nenhum bilhete está à venda.' }); } catch { setFeedback({ message: 'O armazenamento deste dispositivo está indisponível.', error: true }); }
  }
  const capacity = draft.tickets.reduce((sum, ticket) => sum + ticket.capacity, 0);
  return <Screen header={<StudioHeader voltarPara="/estudio" titulo={preview ? 'Pré-visualizar evento' : 'Novo evento'} subtitulo="Rascunho neste dispositivo · só tu vês" accao={<Pastilha tom="espera">Rascunho</Pastilha>} />} footer={state.data && <><Botao bloco onClick={save}>Guardar rascunho</Botao><button type="button" onClick={() => setPreview(!preview)} className="mt-1 min-h-11 w-full rounded-full text-[12px] font-[900] text-dim">{preview ? 'Continuar a editar' : 'Pré-visualizar evento'}</button></>}>
    <CreatorBoundary {...state} loading={!state.data} retry={state.reload}>
      <div className="relative flex aspect-video flex-col justify-end overflow-hidden rounded-[26px] border border-line bg-surface2 p-4"><Flor className="pointer-events-none absolute -right-5 -top-6 size-32 opacity-15" /><div className="relative"><span className="inline-block rounded-full bg-lime px-3 py-1.5 text-[10px] font-[1000] uppercase tracking-widest text-lime-ink">{draft.kind === 'physical' ? 'Presencial' : draft.kind === 'online' ? 'Online' : 'Híbrido'}</span><h2 className="mt-3 text-[23px] font-[1000] leading-tight tracking-tight">{draft.title || 'O teu próximo evento'}</h2><p className="mt-1 text-[12px] font-[800] text-dim">{draft.date ? new Date(`${draft.date}:00+01:00`).toLocaleString('pt-AO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Luanda' }) : 'Define a data'} · {draft.location || 'Define o local'}</p></div></div>
      {!preview && <><CreatorField label="Nome do evento"><input className={creatorField} maxLength={120} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></CreatorField><CreatorField label="Descrição"><textarea className={creatorField} maxLength={2000} rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></CreatorField><CreatorField label="Formato"><select className={creatorField} value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as EventDraft['kind'] })}><option value="physical">Presencial</option><option value="online">Online</option><option value="hybrid">Híbrido</option></select></CreatorField><CreatorField label="Início" note="Hora de Angola (WAT, UTC+1)"><input className={creatorField} type="datetime-local" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></CreatorField><CreatorField label="Fim"><input className={creatorField} type="datetime-local" value={draft.end} onChange={(event) => setDraft({ ...draft, end: event.target.value })} /></CreatorField><CreatorField label={draft.kind === 'online' ? 'Plataforma / local online' : 'Morada completa'}><input className={creatorField} maxLength={300} value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} /></CreatorField></>}
      {preview && <p className="mt-4 whitespace-pre-wrap text-[13px] font-[700] leading-relaxed">{draft.description || 'A descrição do teu evento aparece aqui.'}</p>}
      <div className="mt-5 mb-2 flex items-center justify-between"><Rotulo>Escalões de bilhetes</Rotulo><span className="text-[12px] font-[900] text-dim">Lotação: {capacity}</span></div>
      <div className="flex flex-col gap-3">{draft.tickets.map((ticket, index) => <div key={ticket.id} className="rounded-[24px] border border-line bg-surface p-4">{preview ? <div className="flex justify-between gap-3"><div><p className="text-[14px] font-[900]">{ticket.title}</p><p className="mt-1 text-[11px] font-[700] text-dim">{ticket.capacity} lugares previstos</p></div><span className="algarismos text-[16px] font-[1000]">{formatMoney(creatorMoney(ticket.priceMinor))}</span></div> : <><div className="flex items-center gap-2"><input aria-label={`Nome do escalão ${index + 1}`} className={creatorField} maxLength={80} value={ticket.title} onChange={(event) => setDraft({ ...draft, tickets: draft.tickets.map((value) => value.id === ticket.id ? { ...value, title: event.target.value } : value) })} /><button type="button" aria-label={`Remover ${ticket.title}`} disabled={draft.tickets.length === 1} onClick={() => setDraft({ ...draft, tickets: draft.tickets.filter((value) => value.id !== ticket.id) })} className="size-11 shrink-0 rounded-full text-danger disabled:opacity-30">×</button></div><div className="grid grid-cols-2 gap-3"><CreatorField label="Lugares"><input type="number" className={creatorField} min={1} max={10000} value={ticket.capacity} onChange={(event) => setDraft({ ...draft, tickets: draft.tickets.map((value) => value.id === ticket.id ? { ...value, capacity: Math.max(1, Math.min(10000, event.target.valueAsNumber || 1)) } : value) })} /></CreatorField><CreatorField label="Preço previsto"><select className={creatorField} value={ticket.priceMinor} onChange={(event) => setDraft({ ...draft, tickets: draft.tickets.map((value) => value.id === ticket.id ? { ...value, priceMinor: event.target.value } : value) })}>{['0', '350000', '750000', '1800000', '4500000'].map((price) => <option key={price} value={price}>{formatMoney(creatorMoney(price))}</option>)}</select></CreatorField></div></>}</div>)}</div>
      {!preview && <button type="button" disabled={draft.tickets.length >= 6} onClick={() => setDraft({ ...draft, tickets: [...draft.tickets, { id: crypto.randomUUID(), title: '', capacity: 10, priceMinor: '350000' }] })} className="mt-3 min-h-11 w-full rounded-full border border-dashed border-line text-[12px] font-[900]">+ Adicionar escalão</button>}
      <CreatorNotice>Este editor prepara o evento. Publicação, bilhetes, reservas de lugares e leitura à porta ainda precisam do serviço de eventos. Não são emitidos códigos de entrada nem processados pagamentos.</CreatorNotice>
      {feedback && <CreatorNotice error={feedback.error}>{feedback.message}</CreatorNotice>}
    </CreatorBoundary>
  </Screen>;
}
