import type { MoneyValue } from '@/lib/money';
import { formatMoney } from '@/lib/money';

/**
 * A conta do pagamento, linha a linha, como o P7 a mostra: preço anunciado,
 * taxa da NaDM por cima, e o total que sai da conta do comprador.
 *
 * O design é explícito em nunca esconder a taxa, e é por isso que esta
 * decomposição vem do servidor em vez de ser calculada aqui.
 */
export function MoneyBreakdown({
  price,
  buyerFee,
  amount,
}: {
  price: MoneyValue;
  buyerFee: MoneyValue;
  amount: MoneyValue;
}) {
  return (
    <div className="mt-3.5 flex flex-col gap-2 border-t border-line pt-3.5">
      <Linha rotulo="Valor do pedido" valor={formatMoney(price)} />
      <Linha rotulo="Taxa da NaDM" valor={formatMoney(buyerFee)} />
      <div className="flex items-baseline justify-between border-t border-line pt-2">
        <span className="text-[13px] font-[800] text-dim">Total</span>
        <span className="algarismos text-[20px] font-[1000] tracking-[-0.02em]">
          {formatMoney(amount)}
        </span>
      </div>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between text-[13px] font-[800]">
      <span className="text-dim">{rotulo}</span>
      <span className="algarismos">{valor}</span>
    </div>
  );
}

/** A promessa da retenção, dita antes do botão e não nos termos. */
export function AvisoRetencao({ children }: { children?: React.ReactNode }) {
  return (
    <div className="mt-2.5 flex items-start gap-2.5 rounded-[20px] border border-line bg-wash px-3.5 py-[13px]">
      <svg viewBox="0 0 24 24" className="mt-px size-[17px] shrink-0" aria-hidden="true">
        <rect x="4.5" y="10.5" width="15" height="9.5" rx="3.4" fill="var(--color-lime)" />
        <path
          d="M8.4 10.5V8.2a3.6 3.6 0 0 1 7.2 0v2.3"
          fill="none"
          stroke="var(--color-lime)"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
      </svg>
      <p className="text-[12.5px] font-[700] leading-[1.5] text-dim">
        {children ??
          'O dinheiro fica retido na NaDM. Só passa para o criador depois de ele entregar e tu aprovares. Se não aceitar, volta para ti.'}
      </p>
    </div>
  );
}
