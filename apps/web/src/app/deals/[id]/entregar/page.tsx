'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { Screen } from '@/components/screen';
import { ACarregar, AvisoSemSessao } from '@/components/states';
import { Botao, Pastilha, Rotulo } from '@/components/ui';
import { api, ApiError, type DealDetail } from '@/lib/api';
import { estadoVisual } from '@/lib/deal-state';
import { formatMoney } from '@/lib/money';
import { useSession } from '@/lib/session';

/**
 * P23 — o criador decide e entrega.
 *
 * O contraponto do P9: o mesmo pedido visto por quem tem de o fazer. Prazo e
 * pagamento no mesmo cartão, o briefing verbatim — é contra ele que se grava —
 * e recusar sem castigo, porque é o que evita entregas más feitas a correr.
 */
export default function EntregarPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { userId, ready } = useSession();

  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aTrabalhar, setATrabalhar] = useState(false);
  const [nota, setNota] = useState('');
  const [aRecusar, setARecusar] = useState(false);
  const [motivo, setMotivo] = useState('');

  const carregar = useCallback(async () => {
    if (!userId) return;
    try {
      setDeal(await api<DealDetail>(`/deals/${id}`, { actorUserId: userId }));
    } catch {
      setErro('Não foi possível carregar o pedido.');
    }
  }, [id, userId]);

  useEffect(() => {
    if (ready) void carregar();
  }, [ready, carregar]);

  if (!ready) return null;
  if (!userId) return <AvisoSemSessao />;
  if (!deal) return <ACarregar />;

  const estado = estadoVisual(deal.status, deal.escrowStatus);
  const podeDecidir = deal.status === 'PROPOSED' && deal.escrowStatus === 'HELD';
  const podeEntregar = deal.status === 'ACCEPTED';

  async function agir(accao: () => Promise<unknown>, destino?: string) {
    setATrabalhar(true);
    try {
      await accao();
      if (destino) router.push(destino);
      else await carregar();
      setErro(null);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'A acção falhou.');
    } finally {
      setATrabalhar(false);
    }
  }

  return (
    <Screen
      header={
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0">
            <div className="text-[14.5px] font-[900]">
              {podeDecidir ? 'Pedido novo' : podeEntregar ? 'Por entregar' : 'Pedido'}
            </div>
            <div className="algarismos truncate text-[11.5px] font-[700] text-dim">
              {deal.reference} · {deal.offer.title}
            </div>
          </div>
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

          {podeDecidir ? (
            <>
              <Botao
                bloco
                className="shadow-[0_8px_22px_color-mix(in_oklch,var(--color-lime)_22%,transparent)]"
                onClick={() =>
                  void agir(() =>
                    api(`/deals/${deal.id}/accept`, { method: 'POST', actorUserId: userId }),
                  )
                }
                disabled={aTrabalhar}
              >
                Aceitar e começar
              </Botao>
              <div className="mt-2 flex gap-2.5">
                <Botao variante="secundario" className="h-12 flex-[1.4]" disabled>
                  Pedir mais detalhe
                </Botao>
                <button
                  onClick={() => setARecusar(true)}
                  disabled={aTrabalhar}
                  className="h-12 flex-1 rounded-full text-[14px] font-[900] text-danger disabled:opacity-45"
                >
                  Recusar
                </button>
              </div>
              <p className="mt-2 text-center text-[11px] font-[700] text-dim">
                Ao recusares, o valor volta ao comprador. Recusar não conta na taxa de resposta.
              </p>
            </>
          ) : podeEntregar ? (
            <>
              <Botao
                bloco
                onClick={() =>
                  void agir(
                    () =>
                      api(`/deals/${deal.id}/deliveries`, {
                        method: 'POST',
                        actorUserId: userId,
                        body: { note: nota.trim() || 'Trabalho entregue.' },
                      }),
                    `/deals/${deal.id}`,
                  )
                }
                disabled={aTrabalhar || !nota.trim()}
              >
                Entregar trabalho
              </Botao>
              <p className="mt-2 text-center text-[11px] font-[700] text-dim">
                O comprador aprova e só aí o valor entra na tua carteira.
              </p>
            </>
          ) : (
            <Botao bloco className="h-14" onClick={() => router.push(`/deals/${deal.id}`)}>
              Voltar à conversa
            </Botao>
          )}
        </>
      }
    >
      {/* Prazo e pagamento no mesmo cartão: quanto falta e quanto recebe. */}
      <div
        className={`rounded-[var(--radius-cartao)] p-4 ${
          estado.tom === 'mau'
            ? 'border border-danger bg-[color-mix(in_oklch,var(--color-danger)_12%,transparent)]'
            : 'bg-lime text-lime-ink'
        }`}
      >
        <div className="flex items-center justify-between gap-2.5">
          <div className="min-w-0">
            <div className="text-[10px] font-[800] uppercase tracking-[0.12em] opacity-[0.72]">
              {podeDecidir ? 'Responde até' : 'Entrega até'}
            </div>
            <div className="algarismos mt-[3px] text-[28px] font-[1000] tracking-[-0.04em]">
              {prazo(deal)}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[10px] font-[800] uppercase tracking-[0.12em] opacity-[0.72]">
              Recebes
            </div>
            <div className="algarismos mt-[3px] text-[19px] font-[1000] tracking-[-0.03em]">
              {formatMoney(deal.creatorNet)}
            </div>
          </div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_oklch,var(--color-lime-ink)_18%,transparent)]">
          <div
            className="h-full rounded-full bg-lime-ink"
            style={{ width: `${estado.progresso}%` }}
          />
        </div>
      </div>

      {/* O briefing é intocável: aparece verbatim. */}
      <div className="mt-2.5 rounded-[var(--radius-cartao)] border border-line bg-surface p-[15px]">
        <div className="flex items-center justify-between gap-2.5">
          <Rotulo>O que pediram</Rotulo>
          <span className="rounded-full border border-line px-2.5 py-1 text-[10px] font-[800] text-dim">
            {deal.offer.title}
          </span>
        </div>
        <p className="mt-2.5 text-[13.5px] font-[700] leading-[1.55] whitespace-pre-line">
          {deal.brief ?? 'Sem briefing escrito.'}
        </p>

        <div className="mt-3.5 grid grid-cols-2 gap-3 border-t border-line pt-3.5">
          <Campo k="Prazo" v={`${Math.round(deal.offer.slaHours / 24)} dias`} />
          <Campo k="Alterações" v={String(deal.offer.revisionsIncluded)} />
          <Campo k="Preço anunciado" v={formatMoney(deal.price)} />
          <Campo k="Taxa NaDM" v={formatMoney(deal.creatorFee)} />
        </div>
      </div>

      {podeEntregar ? (
        <div className="mt-2.5">
          <div className="mb-[7px]">
            <Rotulo>A tua entrega</Rotulo>
          </div>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={4}
            placeholder="Diz o que entregaste. Os ficheiros chegam com F3."
            aria-label="A tua entrega"
            className="w-full resize-none rounded-[18px] border border-line bg-wash px-3.5 py-3 text-[13.5px] font-[700] leading-[1.5] text-ink outline-none placeholder:text-dim"
          />
        </div>
      ) : null}

      {podeDecidir ? (
        <div className="mt-2.5 flex items-start gap-2.5 rounded-[20px] border border-line bg-wash p-3.5">
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-lime" />
          <p className="text-[12.5px] font-[700] leading-[1.5] text-dim">
            O valor já está retido na NaDM. Se aceitares, podes trabalhar com a garantia de que
            o dinheiro está lá.
          </p>
        </div>
      ) : null}
    {aRecusar ? (
        <ConfirmSheet
          title="Recusar o pedido"
          confirmLabel="Recusar e devolver"
          cancelLabel="Voltar ao pedido"
          busy={aTrabalhar}
          onCancel={() => setARecusar(false)}
          onConfirm={() =>
            void agir(
              () =>
                api(`/deals/${deal.id}/decline`, {
                  method: 'POST',
                  actorUserId: userId,
                  body: { reason: motivo.trim() || null },
                }),
              `/deals/${deal.id}`,
            )
          }
        >
          <p>
            O valor retido volta inteiro para o comprador e o pedido fecha. Não há como voltar
            atrás.
          </p>
          <textarea
            value={motivo}
            onChange={(evento) => setMotivo(evento.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Queres dizer porquê? (opcional)"
            aria-label="Motivo da recusa"
            className="mt-3 w-full resize-none rounded-[18px] border border-line bg-surface px-3.5 py-3 text-[13px] font-[700] text-ink placeholder:text-dim"
          />
        </ConfirmSheet>
      ) : null}

    </Screen>
  );
}

function Campo({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[9.5px] font-[800] uppercase tracking-[0.1em] text-dim">{k}</div>
      <div className="algarismos mt-[3px] text-[13.5px] font-[1000] tracking-[-0.02em]">{v}</div>
    </div>
  );
}

function prazo(deal: DealDetail): string {
  const alvo = deal.status === 'PROPOSED' ? deal.expiresAt : deal.dueAt;
  if (!alvo) return '—';

  const restante = new Date(alvo).getTime() - Date.now();
  if (restante <= 0) return 'expirou';

  const horas = Math.floor(restante / 3_600_000);
  const minutos = Math.floor((restante % 3_600_000) / 60_000);

  return horas >= 24 ? `${Math.floor(horas / 24)}d ${horas % 24}h` : `${horas}h ${minutos}m`;
}
