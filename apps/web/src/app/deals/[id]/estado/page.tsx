'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Screen } from '@/components/screen';
import { ACarregar, AvisoSemSessao } from '@/components/states';
import { Steps } from '@/components/steps';
import { Botao, Pastilha, Rotulo } from '@/components/ui';
import { api, type DealDetail } from '@/lib/api';
import { estadoVisual, passosDoPedido } from '@/lib/deal-state';
import { formatMoney } from '@/lib/money';
import { useSession } from '@/lib/session';

/**
 * P8 — pedido criado e estado do pedido.
 *
 * O comprador saber exactamente onde está. Quatro passos sempre iguais, e o
 * silêncio com consequência escrita: diz-se a hora limite e que a devolução é
 * automática, para ninguém ter de perseguir o dinheiro.
 */
export default function EstadoDoPedidoPage() {
  const { id } = useParams<{ id: string }>();
  const { userId, ready } = useSession();

  const [deal, setDeal] = useState<DealDetail | null>(null);

  useEffect(() => {
    if (!ready || !userId) return;

    void api<DealDetail>(`/deals/${id}`, { actorUserId: userId }).then(setDeal).catch(() => null);
  }, [ready, userId, id]);

  if (!ready) return null;
  if (!userId) return <AvisoSemSessao />;
  if (!deal) return <ACarregar />;

  const estado = estadoVisual(deal.status, deal.escrowStatus);
  const passos = passosDoPedido(deal.status, deal.escrowStatus);

  return (
    <Screen
      header={
        <div className="flex items-center justify-between gap-3">
          <div className="algarismos text-[14.5px] font-[900]">Pedido {deal.reference}</div>
          <Pastilha tom={estado.tom}>{estado.etiqueta}</Pastilha>
        </div>
      }
      footer={
        <Link href={`/deals/${deal.id}`}>
          <Botao bloco>
            Abrir a conversa
          </Botao>
        </Link>
      }
    >
      <div className="rounded-[var(--radius-cartao)] border border-line bg-surface p-4">
        <Rotulo>O que compraste</Rotulo>
        <div className="algarismos mt-[5px] mb-3 text-[18px] font-[1000] tracking-[-0.025em]">
          {deal.offer.title}
        </div>
        <div className="flex items-baseline gap-2.5">
          <span className="algarismos text-[26px] font-[1000] tracking-[-0.03em]">
            {formatMoney(deal.amount)}
          </span>
          <span className="text-[11.5px] font-[800] text-dim">{estado.retido}</span>
        </div>
      </div>

      <div className="mt-3 rounded-[var(--radius-cartao)] border border-line bg-surface p-4">
        <Steps passos={passos} tom={estado.tom} />
      </div>

      <div className="mt-2.5 flex items-start gap-2.5 rounded-[20px] border border-line bg-wash px-3.5 py-[13px]">
        <span
          className={`mt-1.5 size-2 shrink-0 rounded-full ${
            estado.tom === 'mau' ? 'bg-danger' : estado.tom === 'espera' ? 'bg-amber' : 'bg-lime'
          }`}
        />
        <p className="text-[12.5px] font-[700] leading-[1.5] text-dim">{nota(deal)}</p>
      </div>
    </Screen>
  );
}

function nota(deal: DealDetail): string {
  if (deal.escrowStatus === 'PENDING') {
    return 'Ainda não pagaste. O criador só vê o pedido depois do pagamento.';
  }

  if (deal.status === 'PROPOSED' && deal.expiresAt) {
    const limite = new Date(deal.expiresAt).toLocaleString('pt-PT', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

    return `Se o criador não aceitar até ${limite}, o pedido expira e o valor volta para ti automaticamente. Não tens de fazer nada.`;
  }

  if (deal.status === 'ACCEPTED' && deal.dueAt) {
    const limite = new Date(deal.dueAt).toLocaleString('pt-PT', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

    return `O criador aceitou e entrega até ${limite}. O valor continua retido na NaDM.`;
  }

  if (deal.status === 'DELIVERED') {
    return 'A entrega está à tua espera. Enquanto não aprovares, o valor não sai da NaDM.';
  }

  if (deal.status === 'PAID') {
    return 'Concluído. O valor foi libertado para o criador.';
  }

  return 'O valor está retido na NaDM.';
}
