'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Flor } from '@/components/flor';
import { Screen, TituloComVolta } from '@/components/screen';
import { ACarregar, AvisoSemSessao } from '@/components/states';
import { Botao, Rotulo } from '@/components/ui';
import { api, ApiError, type DealDetail, type Review } from '@/lib/api';
import { useSession } from '@/lib/session';

const NOTAS = ['', 'Má', 'Fraca', 'Razoável', 'Boa', 'Excelente'];

/**
 * P10 — avaliação, devolução e disputa.
 *
 * Ninguém abre isto de bom humor: tom sóbrio, sem cor a festejar. Cinco flores
 * em vez de cinco estrelas, porque é a marca a servir de símbolo — e o mesmo
 * símbolo aparece dos dois lados, aqui e nos números do criador.
 *
 * Uma avaliação por pedido, escrita pelo comprador (RN-046), e só sobre
 * trabalho concluído (RN-047). O que se escreve não se apaga — o que o criador
 * pode fazer é responder uma vez, ao lado.
 */
export default function AvaliarPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { userId, ready } = useSession();

  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [nota, setNota] = useState(0);
  const [texto, setTexto] = useState('');
  const [publicada, setPublicada] = useState<Review | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aTrabalhar, setATrabalhar] = useState(false);
  const [resposta, setResposta] = useState('');

  useEffect(() => {
    if (!ready || !userId) return;
    void api<DealDetail>(`/deals/${id}`, { actorUserId: userId }).then(setDeal).catch(() => null);
    void api<{ review: Review | null }>(`/deals/${id}/review`, { actorUserId: userId })
      .then(({ review }) => {
        if (!review) return;
        setPublicada(review);
        setNota(review.rating);
        setTexto(review.body);
      })
      .catch(() => null);
  }, [ready, userId, id]);

  if (!ready) return null;
  if (!userId) return <AvisoSemSessao />;
  if (!deal) return <ACarregar />;

  const concluido = deal.status === 'PAID' || deal.status === 'APPROVED';
  const enviado = publicada !== null;
  const souCriador = deal.viewerRole === 'creator';
  const podeResponder = souCriador && publicada !== null && !publicada.reply;

  async function responder() {
    setATrabalhar(true);
    setErro(null);

    try {
      setPublicada(
        await api<Review>(`/deals/${deal!.id}/review/reply`, {
          method: 'POST',
          actorUserId: userId!,
          body: { reply: resposta.trim() },
        }),
      );
    } catch (cause) {
      setErro(cause instanceof ApiError ? cause.message : 'Não foi possível responder.');
    } finally {
      setATrabalhar(false);
    }
  }

  async function publicar() {
    setATrabalhar(true);
    setErro(null);

    try {
      setPublicada(
        await api<Review>(`/deals/${deal!.id}/review`, {
          method: 'POST',
          actorUserId: userId!,
          body: { rating: nota, body: texto.trim() },
        }),
      );
    } catch (cause) {
      setErro(cause instanceof ApiError ? cause.message : 'Não foi possível publicar.');
    } finally {
      setATrabalhar(false);
    }
  }

  return (
    <Screen
      header={
        <TituloComVolta
          voltarPara={`/deals/${deal.id}`}
          titulo={souCriador ? 'Avaliação recebida' : enviado ? 'Avaliado' : 'Avaliar o trabalho'}
          subtitulo={`${deal.reference} · ${deal.offer.title}`}
        />
      }
      footer={
        <>
          {erro ? (
            <p className="mb-2.5 text-[12px] font-[800] text-danger" role="alert">
              {erro}
            </p>
          ) : null}
          {podeResponder ? (
            <Botao
              bloco
              onClick={() => void responder()}
              disabled={aTrabalhar || !resposta.trim()}
            >
              {aTrabalhar ? 'A responder…' : 'Publicar resposta'}
            </Botao>
          ) : (
            <Botao
              bloco
              onClick={() => (enviado || souCriador ? router.push('/deals') : void publicar())}
              disabled={!concluido || aTrabalhar || (!enviado && !souCriador && nota === 0)}
            >
              {enviado || souCriador
                ? 'Voltar aos pedidos'
                : aTrabalhar
                  ? 'A publicar…'
                  : 'Publicar avaliação'}
            </Botao>
          )}
          {souCriador ? null : (
            <button
              onClick={() => router.push(`/deals/${deal.id}/disputa`)}
              className="mt-1.5 h-11 w-full rounded-full text-[13.5px] font-[900] text-dim"
            >
              Tive um problema com esta entrega
            </button>
          )}
        </>
      }
    >
      {!concluido ? (
        <div className="rounded-[var(--radius-cartao)] border border-line bg-surface p-4 text-[13px] font-[700] leading-[1.5] text-dim">
          Só se avalia um trabalho concluído. Este ainda está em{' '}
          <span className="text-ink">{deal.status}</span>.
        </div>
      ) : (
        <div className="rounded-[var(--radius-cartao)] border border-line bg-surface p-4">
          <p className="text-[13px] font-[700] leading-[1.5] text-dim">
            {souCriador
              ? enviado
                ? 'O comprador avaliou este trabalho. Podes responder uma vez.'
                : 'O comprador ainda não avaliou este trabalho.'
              : 'Trabalho concluído. Só quem recebeu pode avaliar.'}
          </p>

          <div className="mt-3.5 mb-1 flex gap-[7px]" role="radiogroup" aria-label="Nota">
            {[1, 2, 3, 4, 5].map((valor) => (
              <button
                key={valor}
                role="radio"
                aria-checked={nota === valor}
                aria-label={`${valor} de 5`}
                disabled={enviado}
                onClick={() => setNota(valor)}
                className="transition-transform hover:scale-110 disabled:hover:scale-100"
              >
                <Flor
                  className="size-9"
                  fill={valor <= nota ? 'var(--color-lime)' : 'var(--color-surface2)'}
                />
              </button>
            ))}
          </div>

          <div className="algarismos text-[15px] font-[1000] tracking-[-0.02em]">
            {nota === 0 ? 'Sem nota' : `${nota} de 5 · ${NOTAS[nota]}`}
          </div>

          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            disabled={enviado}
            rows={3}
            placeholder="O que correu bem, o que podia ser melhor."
            aria-label="Comentário"
            className="mt-3.5 min-h-[74px] w-full resize-none rounded-[18px] border border-line bg-wash px-3.5 py-3 text-[13px] font-[700] leading-[1.5] text-ink outline-none placeholder:text-dim disabled:opacity-60"
          />

          <p className="mt-2 text-[11px] font-[700] text-dim">
            A avaliação fica pública no perfil do criador. O que escreveres não pode ser apagado
            depois.
          </p>
        </div>
      )}

      {enviado ? (
        <div className="anima-sobe mt-2.5 flex items-start gap-2.5 rounded-[20px] border border-line bg-wash p-3.5">
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-lime" />
          <p className="text-[12.5px] font-[700] leading-[1.5] text-dim">
            Publicada no perfil do criador. Ele pode responder uma vez, ao lado da tua avaliação.
          </p>
        </div>
      ) : null}

      {publicada?.reply ? (
        <div className="mt-2.5 rounded-[22px] border border-line bg-surface p-3.5">
          <Rotulo>Resposta do criador</Rotulo>
          <p className="mt-2 text-[12.5px] font-[700] leading-[1.5]">{publicada.reply}</p>
        </div>
      ) : podeResponder ? (
        <label className="mt-2.5 block rounded-[22px] border border-line bg-surface p-3.5">
          <Rotulo>A tua resposta</Rotulo>
          <textarea
            value={resposta}
            onChange={(evento) => setResposta(evento.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="A tua versão, ao lado da dele."
            aria-label="Resposta à avaliação"
            className="mt-2 w-full resize-none bg-transparent text-[13px] font-[700] leading-[1.5] outline-none placeholder:text-dim"
          />
          <p className="mt-1 text-[11px] font-[700] text-dim">
            Respondes uma vez, e não se apaga. A nota e o texto dele ficam como estão.
          </p>
        </label>
      ) : null}

      <div className="mt-2.5 rounded-[22px] border border-dashed border-line p-3.5">
        <Rotulo>Se correu mal</Rotulo>
        <p className="mt-2 text-[12.5px] font-[700] leading-[1.5] text-dim">
          Podes pedir a ajuda da NaDM em vez de avaliar. O valor fica retido até haver decisão, e
          nenhuma das partes recebe entretanto.
        </p>
      </div>
    </Screen>
  );
}
