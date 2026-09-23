'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { Screen, TituloComVolta } from '@/components/screen';
import { ACarregar, AvisoSemSessao } from '@/components/states';
import { Botao, Pastilha, Rotulo } from '@/components/ui';
import { api, ApiError, type DealDetail } from '@/lib/api';
import { estadoVisual } from '@/lib/deal-state';
import { useSession } from '@/lib/session';

/**
 * P9 — entrega, alterações e aprovação, do lado de quem recebe.
 *
 * O texto do briefing fica visível por baixo da entrega: é contra isso que se
 * aprova. E o limite de alterações vem com número — "1 de 1 usada" — porque
 * tem de ser lido antes, não descoberto depois.
 */
export default function EntregaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { userId, ready } = useSession();

  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aTrabalhar, setATrabalhar] = useState(false);
  const [aPedirAlteracao, setAPedirAlteracao] = useState(false);
  const [motivo, setMotivo] = useState('');

  const carregar = useCallback(async () => {
    if (!userId) return;
    try {
      setDeal(await api<DealDetail>(`/deals/${id}`, { actorUserId: userId }));
    } catch {
      setErro('Não foi possível carregar a entrega.');
    }
  }, [id, userId]);

  useEffect(() => {
    if (ready) void carregar();
  }, [ready, carregar]);

  if (!ready) return null;
  if (!userId) return <AvisoSemSessao />;
  if (!deal) return <ACarregar />;

  const entrega = deal.deliveries.at(-1);
  const estado = estadoVisual(deal.status, deal.escrowStatus);
  const podeAprovar = deal.viewerRole === 'buyer' && deal.status === 'DELIVERED';
  // Esgotadas as alterações, o botão desaparece em vez de falhar no servidor:
  // o limite tem de ser lido antes, não descoberto depois (RN-044).
  const podePedirAlteracao = podeAprovar && deal.revisionsRemaining > 0;

  async function pedirAlteracao() {
    setATrabalhar(true);
    try {
      await api(`/deals/${deal!.id}/deliveries/${entrega?.version ?? 1}/reject`, {
        method: 'POST',
        actorUserId: userId!,
        body: { reason: motivo.trim() },
      });
      router.push(`/deals/${deal!.id}`);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'O pedido de alteração falhou.');
      setATrabalhar(false);
      setAPedirAlteracao(false);
    }
  }

  async function aprovar() {
    setATrabalhar(true);
    try {
      await api(`/deals/${deal!.id}/deliveries/${entrega?.version ?? 1}/approve`, {
        method: 'POST',
        actorUserId: userId!,
      });
      router.push(`/deals/${deal!.id}/avaliar`);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'A aprovação falhou.');
      setATrabalhar(false);
    }
  }

  return (
    <Screen
      header={
        <div className="flex items-start justify-between gap-2.5">
          <TituloComVolta
            voltarPara={`/deals/${deal.id}`}
            titulo="Entrega do pedido"
            subtitulo={`${deal.reference} · ${deal.offer.title}`}
          />
          <Pastilha tom={estado.tom}>{estado.etiqueta}</Pastilha>
        </div>
      }
      footer={
        <>
          {erro ? (
            <p className="mb-2.5 text-[12px] font-[800] text-danger" role="alert">
              {erro}
            </p>
          ) : null}

          {podeAprovar ? (
            <div className="flex gap-2.5">
              <Botao
                variante="secundario"
                className="h-[54px] flex-1"
                onClick={() => setAPedirAlteracao(true)}
                disabled={!podePedirAlteracao || aTrabalhar}
              >
                Pedir alteração
              </Botao>
              <Botao
                className="h-[54px] flex-[1.3] text-[15px] font-[1000]"
                onClick={() => void aprovar()}
                disabled={aTrabalhar}
              >
                Aprovar
              </Botao>
            </div>
          ) : (
            <Botao bloco className="h-[54px]" onClick={() => router.push(`/deals/${deal.id}`)}>
              Voltar à conversa
            </Botao>
          )}

          <p className="mt-2 text-center text-[11px] font-[700] text-dim">
            {!podeAprovar
              ? 'A entrega foi aprovada e o valor libertado.'
              : podePedirAlteracao
                ? 'Ao aprovar, o valor passa para o criador e não volta atrás.'
                : 'Alterações esgotadas. A partir daqui, só aprovar.'}
          </p>
        </>
      }
    >
      {entrega ? (
        <>
          <div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden rounded-[var(--radius-cartao)] bg-[repeating-linear-gradient(135deg,var(--color-surface2)_0_9px,var(--color-surface)_9px_18px)]">
            <span className="flex size-[58px] items-center justify-center rounded-full bg-lime">
              <svg viewBox="0 0 24 24" className="ml-[3px] size-6" aria-hidden="true">
                <polygon points="8,5 19,12 8,19" fill="var(--color-lime-ink)" />
              </svg>
            </span>
            <span className="absolute right-3 bottom-3 rounded-full bg-[color-mix(in_oklch,var(--color-bg)_80%,transparent)] px-2.5 py-[5px] text-[11px] font-[900]">
              entrega {entrega.version}
            </span>
          </div>

          <div className="mt-2.5 flex items-center gap-2.5 rounded-[20px] border border-line bg-surface px-3.5 py-3">
            <svg viewBox="0 0 24 24" className="size-[18px] shrink-0" aria-hidden="true">
              <path
                d="M6 3h8l4.5 4.5V21H6z"
                fill="none"
                stroke="var(--color-lime)"
                strokeWidth="2.4"
                strokeLinejoin="round"
              />
              <path
                d="M13.5 3v5h5"
                fill="none"
                stroke="var(--color-lime)"
                strokeWidth="2.4"
                strokeLinejoin="round"
              />
            </svg>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-[900]">{entrega.note}</div>
              <div className="text-[11px] font-[700] text-dim">
                entregue{' '}
                {new Date(entrega.submittedAt).toLocaleString('pt-PT', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-[var(--radius-cartao)] border border-dashed border-line px-4 py-8 text-center text-[13px] font-[700] text-dim">
          Ainda não há entrega neste pedido.
        </div>
      )}

      {/* O briefing fica visível por baixo: é contra isto que se aprova. */}
      <div className="mt-2.5 rounded-[22px] border border-line bg-surface p-3.5">
        <Rotulo>O que pediste</Rotulo>
        <p className="mt-2 text-[13px] font-[700] leading-[1.5] whitespace-pre-line">
          {deal.brief ?? 'Sem briefing escrito.'}
        </p>
      </div>

      <div className="mt-2.5 rounded-[22px] border border-line bg-surface p-3.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] font-[900]">Alterações</span>
          <span className="algarismos text-[15px] font-[1000] tracking-[-0.02em]">
            {deal.revisionCount} de {deal.offer.revisionsIncluded} usadas
          </span>
        </div>
      </div>

      {deal.status === 'DELIVERED' ? (
        <div className="mt-2.5 rounded-[22px] border border-line bg-surface p-3.5">
          <div className="flex items-center gap-2.5">
            <svg viewBox="0 0 24 24" className="size-[18px] shrink-0" aria-hidden="true">
              <circle cx="12" cy="12" r="9" fill="none" stroke="var(--color-amber)" strokeWidth="2.2" />
              <path d="M12 7v5l3.5 2" fill="none" stroke="var(--color-amber)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-[13px] font-[900]">Aprovação automática</span>
          </div>
          <p className="mt-2 text-[11.5px] font-[700] leading-[1.45] text-dim">
            Se não disseres nada em 72 horas, a entrega é aprovada automaticamente e o valor
            passa para o criador.
          </p>
        </div>
      ) : (
        <p className="mt-2.5 text-center text-[11.5px] font-[700] leading-[1.45] text-dim">
          A entrega foi aprovada e o valor libertado.
        </p>
      )}

      {aPedirAlteracao ? (
        <ConfirmSheet
          title="Pedir alteração"
          confirmLabel="Enviar pedido"
          busy={aTrabalhar}
          disabled={!motivo.trim()}
          onCancel={() => setAPedirAlteracao(false)}
          onConfirm={() => void pedirAlteracao()}
        >
          <p>
            O trabalho volta ao criador com prazo novo de {deal.offer.slaHours}h e o teu dinheiro
            continua retido.{' '}
            {deal.revisionsRemaining === 1
              ? 'Esta é a tua última alteração.'
              : `Ficam-te ${deal.revisionsRemaining - 1} depois desta.`}
          </p>
          <textarea
            value={motivo}
            onChange={(evento) => setMotivo(evento.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="O que precisa de mudar?"
            aria-label="Motivo do pedido de alteração"
            className="mt-3 w-full resize-none rounded-[18px] border border-line bg-surface px-3.5 py-3 text-[13px] font-[700] text-ink placeholder:text-dim"
          />
        </ConfirmSheet>
      ) : null}
    </Screen>
  );
}
