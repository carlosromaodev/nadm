'use client';

import { useEffect, useState } from 'react';
import { CreatorBoundary, CreatorField, CreatorNotice, creatorField } from '@/components/creator-ui';
import { Screen } from '@/components/screen';
import { StudioHeader } from '@/components/studio-nav';
import { Botao, Pastilha, Rotulo } from '@/components/ui';
import { api, ApiError, type AvailabilityWindow, type Offer } from '@/lib/api';
import { useCreatorData, type CreatorSettings } from '@/lib/creator-api';

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Uma vaga, no fuso de Luanda, que é o único que o produto conhece. */
function apresentarVaga(window: AvailabilityWindow): string {
  const inicio = new Date(window.startsAt);
  const fim = new Date(window.endsAt);
  const hora = (data: Date) =>
    data.toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Luanda' });

  return `${inicio.toLocaleDateString('pt-AO', { day: 'numeric', month: 'short', timeZone: 'Africa/Luanda' })} · ${hora(inicio)}–${hora(fim)}`;
}

/** O que o `datetime-local` devolve é hora local; o servidor quer ISO. */
function paraIso(valor: string): string {
  return new Date(valor).toISOString();
}
const DEFAULT_AGENDA = { days: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '18:00', slotsPerDay: 5, pauseUntil: null };
export default function AgendaPage() {
  const state = useCreatorData();
  const [agenda, setAgenda] = useState<NonNullable<CreatorSettings['agenda']>>(DEFAULT_AGENDA);
  const [paused, setPaused] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  useEffect(() => { if (state.data) { setAgenda(state.data.profile.settings?.agenda ?? DEFAULT_AGENDA); setPaused(state.data.profile.availabilityStatus === 'PAUSED'); } }, [state.data]);
  async function save() {
    if (!state.userId || saving) return;
    if (agenda.startTime >= agenda.endTime || !agenda.days.length) { setFeedback({ message: 'Escolhe pelo menos um dia e uma hora de fim posterior ao início.', error: true }); return; }
    setSaving(true); setFeedback(null);
    try { await api('/profiles/me', { method: 'PATCH', actorUserId: state.userId, body: { availabilityStatus: paused ? 'PAUSED' : 'AVAILABLE', settings: { agenda } } }); setFeedback({ message: paused ? 'Pedidos pausados. Os trabalhos existentes continuam na caixa.' : 'Disponibilidade guardada.' }); state.reload(); }
    catch (cause) { setFeedback({ message: cause instanceof Error ? cause.message : 'Não foi possível guardar.', error: true }); }
    finally { setSaving(false); }
  }
  return <Screen header={<StudioHeader voltarPara="/estudio" titulo="Agenda" subtitulo="Disponibilidade · hora de Angola (WAT)" />} footer={state.data && <Botao bloco disabled={saving} onClick={() => void save()}>{saving ? 'A guardar…' : 'Guardar disponibilidade'}</Botao>}>
    <CreatorBoundary {...state} loading={!state.data} retry={state.reload}>
      <div className="rounded-[24px] border border-line bg-surface p-4"><div className="flex items-center justify-between gap-2"><p className="text-[19px] font-[1000]">{paused ? 'Pedidos fechados' : 'A receber pedidos'}</p><Pastilha tom={paused ? 'espera' : 'ok'}>{paused ? 'Em pausa' : 'Disponível'}</Pastilha></div><p className="mt-2 text-[12px] font-[700] leading-relaxed text-dim">{paused ? 'O teu conteúdo mantém-se no perfil. Os pedidos já aceites não são cancelados.' : 'Define quando estás disponível. A confirmação de cada marcação é feita contigo na conversa.'}</p><button type="button" onClick={() => setPaused(!paused)} className="mt-3 min-h-11 w-full rounded-full border border-line text-[13px] font-[900]">{paused ? 'Voltar ao activo' : 'Entrar em pausa'}</button></div>
      {paused && <CreatorField label="Regresso previsto" note="Data informativa. Reabre os pedidos quando estiveres disponível."><input className={creatorField} type="date" value={agenda.pauseUntil ?? ''} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setAgenda({ ...agenda, pauseUntil: event.target.value || null })} /></CreatorField>}
      <div className="mt-5 mb-2"><Rotulo>Dias de trabalho</Rotulo></div><div className="grid grid-cols-7 gap-1">{DAYS.map((day, index) => <button key={day} type="button" aria-pressed={agenda.days.includes(index)} aria-label={day} onClick={() => setAgenda({ ...agenda, days: agenda.days.includes(index) ? agenda.days.filter((value) => value !== index) : [...agenda.days, index].sort() })} className={`min-h-[54px] rounded-[15px] text-[12px] font-[900] ${agenda.days.includes(index) ? 'bg-lime text-lime-ink' : 'border border-line text-dim'}`}>{day}</button>)}</div>
      <div className="grid grid-cols-2 gap-3"><CreatorField label="Das"><input className={creatorField} type="time" value={agenda.startTime} onChange={(event) => setAgenda({ ...agenda, startTime: event.target.value })} /></CreatorField><CreatorField label="Até às"><input className={creatorField} type="time" value={agenda.endTime} onChange={(event) => setAgenda({ ...agenda, endTime: event.target.value })} /></CreatorField></div>
      <CreatorField label="Objectivo de pedidos por dia" note="Preferência de organização, não uma reserva automática de vagas."><input className={creatorField} type="number" min={1} max={100} value={agenda.slotsPerDay} onChange={(event) => setAgenda({ ...agenda, slotsPerDay: Math.max(1, Math.min(100, event.target.valueAsNumber || 1)) })} /></CreatorField>
      {feedback && <CreatorNotice error={feedback.error}>{feedback.message}</CreatorNotice>}

      <Vagas
        windows={state.data?.windows ?? []}
        offers={(state.data?.profile.offers ?? []).filter((offer) => offer.kind === 'BOOKING')}
        userId={state.userId}
        onChange={state.reload}
      />
    </CreatorBoundary>
  </Screen>;
}

/**
 * As vagas a sério, por oposição às preferências de agenda acima.
 *
 * Uma vaga aberta aqui é o que o comprador escolhe e o que o sistema reserva na
 * transacção que cria o pedido. Os dias e horas de trabalho da secção anterior
 * são intenção; isto é compromisso.
 */
function Vagas({
  windows,
  offers,
  userId,
  onChange,
}: {
  windows: AvailabilityWindow[];
  offers: Offer[];
  userId: string | null;
  onChange: () => void;
}) {
  const [offerId, setOfferId] = useState('');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [vagas, setVagas] = useState(1);
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);

  useEffect(() => {
    if (!offerId && offers.length) setOfferId(offers[0].id);
  }, [offers, offerId]);

  if (!offers.length) {
    return (
      <div className="mt-6 rounded-[22px] border border-dashed border-line p-3.5">
        <Rotulo>Vagas</Rotulo>
        <p className="mt-2 text-[12px] font-[700] leading-relaxed text-dim">
          As vagas pertencem a ofertas de marcação. Cria uma oferta desse tipo para começares a
          abrir horários.
        </p>
      </div>
    );
  }

  async function abrir() {
    if (!userId) return;

    setAGravar(true);
    setErro(null);

    try {
      await api('/availability', {
        method: 'POST',
        actorUserId: userId,
        body: { offerId, startsAt: paraIso(inicio), endsAt: paraIso(fim), slotsTotal: vagas },
      });
      setInicio('');
      setFim('');
      onChange();
    } catch (cause) {
      setErro(cause instanceof ApiError ? cause.message : 'Não foi possível abrir a vaga.');
    } finally {
      setAGravar(false);
    }
  }

  async function fechar(id: string) {
    if (!userId) return;

    try {
      await api(`/availability/${id}`, { method: 'DELETE', actorUserId: userId });
      onChange();
    } catch (cause) {
      setErro(cause instanceof ApiError ? cause.message : 'Não foi possível fechar a vaga.');
    }
  }

  return (
    <div className="mt-6">
      <Rotulo>Vagas abertas</Rotulo>

      {windows.length ? (
        <div className="mt-2">
          {windows.map((window) => (
            <div key={window.id} className="flex items-center gap-3 border-b border-line py-3">
              <div className="min-w-0 flex-1">
                <p className="algarismos truncate text-[13px] font-[900]">{apresentarVaga(window)}</p>
                <p className="mt-0.5 text-[11px] font-[700] text-dim">
                  {window.slotsTotal - window.slotsFree} de {window.slotsTotal} tomadas
                </p>
              </div>
              {window.slotsFree === window.slotsTotal ? (
                <button
                  type="button"
                  onClick={() => void fechar(window.id)}
                  className="shrink-0 text-[11.5px] font-[900] text-danger"
                >
                  Fechar
                </button>
              ) : (
                <Pastilha tom="ok">reservada</Pastilha>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[12px] font-[700] text-dim">
          Ainda não abriste vagas. Sem vagas, uma oferta de marcação não pode ser contratada.
        </p>
      )}

      <div className="mt-4 rounded-[22px] border border-line bg-surface p-3.5">
        <Rotulo>Abrir vaga</Rotulo>

        {offers.length > 1 ? (
          <select
            value={offerId}
            onChange={(event) => setOfferId(event.target.value)}
            aria-label="Oferta"
            className={`${creatorField} mt-2`}
          >
            {offers.map((offer) => (
              <option key={offer.id} value={offer.id}>
                {offer.title}
              </option>
            ))}
          </select>
        ) : null}

        <div className="mt-2 grid grid-cols-2 gap-3">
          <CreatorField label="Começa">
            <input
              className={creatorField}
              type="datetime-local"
              value={inicio}
              onChange={(event) => setInicio(event.target.value)}
            />
          </CreatorField>
          <CreatorField label="Acaba">
            <input
              className={creatorField}
              type="datetime-local"
              value={fim}
              onChange={(event) => setFim(event.target.value)}
            />
          </CreatorField>
        </div>

        <CreatorField label="Quantas pessoas" note="Cada pedido criado consome uma vaga.">
          <input
            className={creatorField}
            type="number"
            min={1}
            max={500}
            value={vagas}
            onChange={(event) => setVagas(Math.max(1, Math.min(500, event.target.valueAsNumber || 1)))}
          />
        </CreatorField>

        {erro ? <CreatorNotice error>{erro}</CreatorNotice> : null}

        <Botao
          bloco
          className="mt-3"
          disabled={aGravar || !inicio || !fim || !offerId}
          onClick={() => void abrir()}
        >
          {aGravar ? 'A abrir…' : 'Abrir vaga'}
        </Botao>
      </div>
    </div>
  );
}
