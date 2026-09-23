'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Screen, TituloComVolta } from '@/components/screen';
import { ACarregar } from '@/components/states';
import { Botao, Painel, Rotulo } from '@/components/ui';
import { LinkAction, LoadError } from '@/components/viewer-ui';
import { api, ApiError, type AvailabilityWindow } from '@/lib/api';
import { formatMoney } from '@/lib/money';
import { useSession } from '@/lib/session';
import { useResource, type ViewerProfile } from '@/lib/viewer-data';

/** Uma vaga, no fuso de Luanda, que é o único que o produto conhece. */
function apresentarVaga(window: AvailabilityWindow): string {
  const inicio = new Date(window.startsAt);
  const fim = new Date(window.endsAt);

  const dia = inicio.toLocaleDateString('pt-AO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Africa/Luanda',
  });

  const hora = (data: Date) =>
    data.toLocaleTimeString('pt-AO', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Africa/Luanda',
    });

  return `${dia}, ${hora(inicio)}–${hora(fim)}`;
}

/**
 * P·marcar — escolher uma vaga e contratar.
 *
 * A vaga só é tomada quando o pedido é criado, e na mesma transacção
 * (RN-034). Até lá, o que se vê aqui é o que ainda estava livre da última vez
 * que a página leu — e é por isso que contratar pode falhar com 409 se alguém
 * chegar primeiro. É o único desfecho honesto: reservar ao escolher daria
 * vagas presas por quem nunca chegou a contratar.
 */
export default function BookingPage() {
  const { handle, offerId } = useParams<{ handle: string; offerId: string }>();
  const router = useRouter();
  const { userId } = useSession();
  const resource = useResource<ViewerProfile>(`/profiles/${encodeURIComponent(handle)}`);

  const [vagas, setVagas] = useState<AvailabilityWindow[] | null>(null);
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [briefing, setBriefing] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aEnviar, setAEnviar] = useState(false);

  useEffect(() => {
    void api<{ data: AvailabilityWindow[] }>(`/offers/${offerId}/availability`)
      .then(({ data }) => setVagas(data.filter((window) => window.slotsFree > 0)))
      .catch(() => setVagas([]));
  }, [offerId]);

  if (resource.error) {
    return (
      <Screen header={<TituloComVolta voltarPara={`/${handle}`} titulo="Marcar" />}>
        <LoadError message={resource.error} retry={resource.retry} />
      </Screen>
    );
  }

  if (!resource.data || vagas === null) return <ACarregar />;

  const offer = resource.data.offers.find(
    (entry) => entry.id === offerId && entry.kind === 'BOOKING',
  );

  if (!offer) {
    return (
      <Screen header={<TituloComVolta voltarPara={`/${handle}`} titulo="Marcar" />}>
        <LoadError
          title="Marcação indisponível"
          message="Esta ligação não corresponde a uma oferta de marcação publicada."
        />
        <LinkAction href={`/${handle}`} secondary className="w-full">
          Ver ofertas do criador
        </LinkAction>
      </Screen>
    );
  }

  const podeContratar =
    escolhida !== null && (!offer.requiresBrief || briefing.trim().length > 0);

  async function contratar() {
    if (!userId) {
      router.push(`/entrar?next=${encodeURIComponent(`/${handle}/marcar/${offerId}`)}`);
      return;
    }

    setAEnviar(true);
    setErro(null);

    try {
      const deal = await api<{ id: string }>('/deals', {
        method: 'POST',
        actorUserId: userId,
        body: {
          offerId,
          brief: briefing.trim() || null,
          availabilityWindowId: escolhida,
        },
      });

      // Criado e por pagar: o passo seguinte é o Express (DP-15).
      router.push(`/deals/${deal.id}/pagar`);
    } catch (cause) {
      setErro(
        cause instanceof ApiError
          ? cause.message
          : 'Não foi possível marcar. Tenta outra vaga.',
      );
      setAEnviar(false);
      // A vaga escolhida pode ter sido tomada entretanto: relê o que sobrou.
      void api<{ data: AvailabilityWindow[] }>(`/offers/${offerId}/availability`)
        .then(({ data }) => {
          setVagas(data.filter((window) => window.slotsFree > 0));
          setEscolhida(null);
        })
        .catch(() => null);
    }
  }

  return (
    <Screen
      header={
        <TituloComVolta
          voltarPara={`/${handle}`}
          titulo="Marcar"
          subtitulo={`${offer.title} · ${formatMoney(offer.price)}`}
        />
      }
      footer={
        vagas.length ? (
          <>
            {erro ? (
              <p className="mb-2.5 text-[12px] font-[800] text-danger" role="alert">
                {erro}
              </p>
            ) : null}
            <Botao bloco disabled={!podeContratar || aEnviar} onClick={() => void contratar()}>
              {aEnviar ? 'A marcar…' : 'Marcar e pagar'}
            </Botao>
            <p className="mt-2 text-center text-[12px] font-[700] text-dim">
              A vaga fica tua quando o pedido for criado. O valor fica retido até aprovares.
            </p>
          </>
        ) : (
          <LinkAction href={`/${handle}`} secondary className="w-full">
            Ver outras ofertas
          </LinkAction>
        )
      }
    >
      {vagas.length ? (
        <>
          <Rotulo>Vagas disponíveis</Rotulo>
          <div className="mt-2 flex flex-col gap-2">
            {vagas.map((vaga) => (
              <button
                key={vaga.id}
                type="button"
                role="radio"
                aria-checked={escolhida === vaga.id}
                onClick={() => setEscolhida(vaga.id)}
                className={`flex items-center justify-between gap-3 rounded-[20px] border px-3.5 py-3 text-left ${
                  escolhida === vaga.id
                    ? 'border-lime bg-[color-mix(in_oklch,var(--color-lime)_12%,transparent)]'
                    : 'border-line bg-surface'
                }`}
              >
                <span className="min-w-0 flex-1 text-[13px] font-[900]">
                  {apresentarVaga(vaga)}
                </span>
                <span className="shrink-0 text-[11px] font-[800] text-dim">
                  {vaga.slotsFree === 1 ? 'última vaga' : `${vaga.slotsFree} vagas`}
                </span>
              </button>
            ))}
          </div>

          <p className="mt-2 px-1 text-[11.5px] font-[700] text-dim">
            Horas de Luanda · WAT (UTC+1)
          </p>

          {offer.requiresBrief ? (
            <label className="mt-4 block rounded-[22px] border border-line bg-surface p-3.5">
              <Rotulo>O que precisas</Rotulo>
              <textarea
                value={briefing}
                onChange={(evento) => setBriefing(evento.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Diz o que queres tratar nesta marcação."
                aria-label="Briefing"
                className="mt-2 w-full resize-none bg-transparent text-[13.5px] font-[700] leading-[1.5] outline-none placeholder:text-dim"
              />
            </label>
          ) : null}
        </>
      ) : (
        <Painel>
          <h2 className="text-[14px] font-[900]">Sem vagas por agora</h2>
          <p className="mt-2 text-[12px] leading-relaxed font-[700] text-dim">
            O criador ainda não abriu vagas para esta oferta, ou as que havia já foram tomadas.
            Volta a espreitar — as vagas recusadas ou expiradas regressam.
          </p>
        </Painel>
      )}
    </Screen>
  );
}
