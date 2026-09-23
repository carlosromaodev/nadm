'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Conversation } from '@/components/conversation';
import { DealCard } from '@/components/deal-card';
import { ACarregar, AvisoSemSessao } from '@/components/states';
import { Botao } from '@/components/ui';
import { api, ApiError, type DealDetail } from '@/lib/api';
import { podePedirDevolucao, proximoPasso } from '@/lib/deal-state';
import { useSession } from '@/lib/session';

/**
 * O ecrã que prova a tese: estado, valores, conversa, entrega e acções na
 * mesma página, porque no modelo são a mesma entidade.
 */
export default function DealPage() {
  const { id } = useParams<{ id: string }>();
  const { userId, ready } = useSession();

  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aTrabalhar, setATrabalhar] = useState(false);
  const [rascunho, setRascunho] = useState('');

  const carregar = useCallback(async () => {
    if (!userId) return;

    try {
      setDeal(await api<DealDetail>(`/deals/${id}`, { actorUserId: userId }));
      setErro(null);
    } catch (error) {
      // 404 aqui não distingue "não existe" de "não és parte" — é deliberado
      // no servidor (RN-063), e o ecrã não deve inventar a diferença.
      setErro(error instanceof ApiError ? error.message : 'Não foi possível carregar o pedido.');
    }
  }, [id, userId]);

  useEffect(() => {
    if (ready) void carregar();
  }, [ready, carregar]);

  const agir = useCallback(
    async (accao: () => Promise<unknown>) => {
      setATrabalhar(true);
      try {
        await accao();
        await carregar();
        setErro(null);
      } catch (error) {
        setErro(error instanceof ApiError ? error.message : 'A acção falhou.');
      } finally {
        setATrabalhar(false);
      }
    },
    [carregar],
  );

  if (!ready) return null;

  if (!userId) {
    return <AvisoSemSessao />;
  }

  if (erro && !deal) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-[16px] font-[900]">Pedido não encontrado</p>
        <p className="text-[13px] font-[700] text-dim">{erro}</p>
        <Link href="/deals" className="text-[13px] font-[900] text-lime">
          Voltar aos pedidos
        </Link>
      </div>
    );
  }

  if (!deal) return <ACarregar />;

  const passo = proximoPasso(deal.status, deal.escrowStatus, deal.viewerRole);
  const entrega = deal.deliveries.at(-1);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex flex-none items-center gap-[11px] border-b border-line px-4 pt-2 pb-2.5">
        <Link
          href="/deals"
          aria-label="Voltar"
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line"
        >
          <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
            <path
              d="M14.5 5.5 8 12l6.5 6.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14.5px] font-[900]">{deal.offer.title}</div>
          <div className="algarismos text-[11.5px] font-[700] text-dim">
            {deal.viewerRole === 'buyer' ? 'O teu pedido' : 'Pedido recebido'} · {deal.reference}
          </div>
        </div>
      </header>

      <div className="rolo flex-1 px-4 pt-3.5 pb-2.5">
        <Conversation messages={deal.messages} viewerUserId={userId}>
          <DealCard deal={deal} prazo={prazoDe(deal)} />
        </Conversation>

        {entrega ? (
          <div className="mt-2.5 flex items-center gap-2.5 rounded-[18px] border border-line bg-surface p-3">
            <span className="flex size-[46px] shrink-0 items-center justify-center rounded-[14px] bg-surface2">
              <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
                <polygon points="9.2,6.8 17,12 9.2,17.2" fill="var(--color-lime)" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-[900]">Entrega {entrega.version}</div>
              <div className="truncate text-[11px] font-[700] text-dim">{entrega.note}</div>
            </div>
            <Link
              href={`/deals/${deal.id}/entrega`}
              className="shrink-0 text-[11.5px] font-[900] text-lime"
            >
              Ver
            </Link>
          </div>
        ) : null}
      </div>

      <footer className="flex-none border-t border-line bg-bg px-4 pt-2.5 pb-3">
        {passo.nota ? (
          <div className="mb-2.5 flex items-start gap-2.5 rounded-[18px] border border-line bg-wash px-3 py-2.5">
            <span className="mt-[5px] size-2 shrink-0 rounded-full bg-lime" />
            <p className="text-[12.5px] font-[700] leading-[1.45] text-dim">{passo.nota}</p>
          </div>
        ) : null}

        {erro ? (
          <p className="mb-2.5 text-[12px] font-[800] text-danger" role="alert">
            {erro}
          </p>
        ) : null}

        <AccoesDoPedido
          deal={deal}
          aTrabalhar={aTrabalhar}
          onPedirDevolucao={() =>
            agir(() => api(`/deals/${deal.id}/refund`, { method: 'POST', actorUserId: userId }))
          }
          onAceitar={() =>
            agir(() =>
              api(`/deals/${deal.id}/accept`, { method: 'POST', actorUserId: userId }),
            )
          }
          onPagar={() =>
            agir(() =>
              api(`/deals/${deal.id}/payments`, {
                method: 'POST',
                actorUserId: userId,
                idempotencyKey: `pagar-${deal.id}`,
                body: { payerPhone: '+244923222222' },
              }),
            )
          }
          onEntregar={() =>
            agir(() =>
              api(`/deals/${deal.id}/deliveries`, {
                method: 'POST',
                actorUserId: userId,
                body: { note: rascunho.trim() || 'Trabalho entregue.' },
              }),
            )
          }
          onAprovar={() =>
            agir(() =>
              api(`/deals/${deal.id}/deliveries/${entrega?.version ?? 1}/approve`, {
                method: 'POST',
                actorUserId: userId,
              }),
            )
          }
        />

        {deal.dispute ? (
          <div className="mt-2 rounded-[18px] border border-line bg-wash px-3.5 py-3">
            <p className="text-[12px] font-[900]">A NaDM está a analisar</p>
            <p className="mt-1 text-[11.5px] font-[700] leading-[1.45] text-dim">
              O valor fica retido até haver decisão. Nenhuma das partes recebe entretanto.
            </p>
            {deal.dispute.openedByUserId === userId ? (
              <button
                type="button"
                onClick={() =>
                  agir(() =>
                    api(`/deals/${deal.id}/disputes/withdraw`, {
                      method: 'POST',
                      actorUserId: userId,
                    }),
                  )
                }
                disabled={aTrabalhar}
                className="mt-2 text-[11.5px] font-[900] text-dim underline underline-offset-2"
              >
                Já nos entendemos — retirar a disputa
              </button>
            ) : null}
          </div>
        ) : ['ACCEPTED', 'IN_PROGRESS', 'DELIVERED'].includes(deal.status) ? (
          <Link
            href={`/deals/${deal.id}/disputa`}
            className="mt-2 block text-center text-[11.5px] font-[900] text-dim underline underline-offset-2"
          >
            Alguma coisa correu mal? Pedir ajuda da NaDM
          </Link>
        ) : null}

        <form
          className="mt-2.5 flex items-center gap-2.5"
          onSubmit={(evento) => {
            evento.preventDefault();
            const texto = rascunho.trim();
            if (!texto) return;

            void agir(async () => {
              await api(`/deals/${deal.id}/messages`, {
                method: 'POST',
                actorUserId: userId,
                body: { body: texto, clientId: `${deal.id}-${Date.now()}` },
              });
              setRascunho('');
            });
          }}
        >
          <input
            value={rascunho}
            onChange={(evento) => setRascunho(evento.target.value)}
            placeholder="Escrever mensagem"
            aria-label="Escrever mensagem"
            className="h-11 flex-1 rounded-full border border-line bg-wash px-[15px] text-[13px] font-[700] text-ink outline-none placeholder:text-dim"
          />
          <button
            type="submit"
            disabled={!rascunho.trim() || aTrabalhar}
            aria-label="Enviar"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-lime text-lime-ink disabled:opacity-45"
          >
            <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true">
              <path
                d="M4 12h15M13 6l6 6-6 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </form>
      </footer>
    </div>
  );
}

function AccoesDoPedido({
  deal,
  aTrabalhar,
  onAceitar,
  onPagar,
  onEntregar,
  onAprovar,
  onPedirDevolucao,
}: {
  deal: DealDetail;
  aTrabalhar: boolean;
  onAceitar: () => void;
  onPagar: () => void;
  onEntregar: () => void;
  onAprovar: () => void;
  onPedirDevolucao: () => void;
}) {
  const { status, viewerRole } = deal;

  const pago = deal.escrowStatus === 'HELD';

  // T16 — o prazo foi ultrapassado com folga e o comprador pode levantar o
  // dinheiro. Quem diz quando o direito nasce é o servidor, em `refundableFrom`.
  if (podePedirDevolucao(deal, viewerRole, new Date())) {
    return (
      <>
        <Botao bloco variante="secundario" onClick={onPedirDevolucao} disabled={aTrabalhar}>
          Pedir devolução
        </Botao>
        <p className="mt-2 text-center text-[11px] font-[700] text-dim">
          O prazo de entrega passou. O valor retido volta inteiro para ti.
        </p>
      </>
    );
  }

  // Paga-se antes de o criador aceitar (DP-15).
  // Cada acção tem o seu ecrã no design; daqui só se lá vai.
  if (viewerRole === 'buyer' && status === 'PROPOSED' && !pago) {
    return (
      <Link href={`/deals/${deal.id}/pagar`}>
        <Botao bloco>Pagar com MULTICAIXA Express</Botao>
      </Link>
    );
  }

  if (viewerRole === 'creator' && status === 'PROPOSED' && pago) {
    return (
      <Link href={`/deals/${deal.id}/entregar`}>
        <Botao bloco>Ver e decidir</Botao>
      </Link>
    );
  }

  if (viewerRole === 'creator' && status === 'ACCEPTED') {
    return (
      <Link href={`/deals/${deal.id}/entregar`}>
        <Botao bloco>Entregar trabalho</Botao>
      </Link>
    );
  }

  if (viewerRole === 'buyer' && status === 'DELIVERED') {
    return (
      <Link href={`/deals/${deal.id}/entrega`}>
        <Botao bloco>Ver a entrega e aprovar</Botao>
      </Link>
    );
  }

  if (viewerRole === 'buyer' && status === 'PAID') {
    return (
      <Link href={`/deals/${deal.id}/avaliar`}>
        <Botao bloco variante="secundario">Avaliar o trabalho</Botao>
      </Link>
    );
  }

  return null;
}

function prazoDe(deal: DealDetail): { rotulo: string; valor: string } {
  const formato = (iso: string) =>
    new Date(iso).toLocaleString('pt-PT', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  if (deal.status === 'PROPOSED' && deal.expiresAt) {
    return { rotulo: 'Aceita até', valor: formato(deal.expiresAt) };
  }

  if (deal.dueAt && (deal.status === 'ACCEPTED' || deal.status === 'DELIVERED')) {
    return { rotulo: 'Entrega até', valor: formato(deal.dueAt) };
  }

  if (deal.status === 'PAID') {
    return { rotulo: 'Concluído', valor: formato(deal.createdAt) };
  }

  return { rotulo: 'Prazo de entrega', valor: `${deal.offer.slaHours}h` };
}
