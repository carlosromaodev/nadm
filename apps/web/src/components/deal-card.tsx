import type { Deal } from '@/lib/api';
import { estadoVisual } from '@/lib/deal-state';
import { formatMoney } from '@/lib/money';
import { Barra, Pastilha } from './ui';

/**
 * O cartão do pedido, tal como o design o coloca: dentro da conversa, não numa
 * página à parte.
 *
 * É a peça onde a tese do produto fica visível — o valor, onde está o dinheiro
 * e o prazo aparecem no meio das mensagens, porque pedido, pagamento e conversa
 * são a mesma coisa.
 */
export function DealCard({ deal, prazo }: { deal: Deal; prazo: { rotulo: string; valor: string } }) {
  const estado = estadoVisual(deal.status, deal.escrowStatus);

  return (
    <div className="anima-sobe rounded-[var(--radius-cartao)] border border-line bg-surface p-[14px]">
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <div className="text-[9.5px] font-[800] uppercase tracking-[0.12em] text-dim">
            Pedido {deal.reference}
          </div>
          <div className="algarismos mt-[3px] truncate text-[16px] font-[1000] tracking-[-0.02em]">
            {deal.offer.title}
          </div>
        </div>
        <Pastilha tom={estado.tom}>{estado.etiqueta}</Pastilha>
      </div>

      <div className="mt-3 mb-1 flex items-baseline gap-2">
        <span className="algarismos text-[24px] font-[1000] tracking-[-0.03em]">
          {formatMoney(deal.amount)}
        </span>
        <span className="text-[11px] font-[800] text-dim">{estado.retido}</span>
      </div>

      <Barra progresso={estado.progresso} tom={estado.tom} />

      <div className="flex justify-between text-[11.5px] font-[800] text-dim">
        <span>{prazo.rotulo}</span>
        <span className="text-ink">{prazo.valor}</span>
      </div>
    </div>
  );
}
