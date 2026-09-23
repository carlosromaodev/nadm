import type { Money } from '@/shared/domain/money';

export type MessageKind = 'TEXT' | 'SYSTEM' | 'ATTACHMENT' | 'STATE_CHANGE';

export interface Message {
  readonly id: string;
  readonly dealId: string;
  readonly senderUserId: string | null;
  readonly kind: MessageKind;
  readonly body: string;
  readonly clientId: string | null;
  readonly readAt: Date | null;
  readonly createdAt: Date;
}

/**
 * Texto das mensagens que o sistema escreve na conversa a cada transição
 * (RN-049). Lida de cima a baixo, a conversa conta a história do negócio.
 */
export const STATE_CHANGE_BODY = {
  PROPOSED: 'Pedido criado. Falta o pagamento para o criador o poder decidir.',
  PAYMENT_HELD: 'Pagamento confirmado. O valor fica retido na NaDM até aprovares a entrega.',
  ACCEPTED: 'O criador aceitou o pedido. O prazo de entrega começou a contar.',
  DELIVERED: 'O criador submeteu a entrega.',
  APPROVED: 'A entrega foi aprovada.',
  PAID: 'O valor foi libertado para a carteira do criador.',
  DECLINED: 'O criador recusou o pedido.',
  EXPIRED: 'O pedido expirou sem resposta do criador.',
  DELIVERY_REJECTED: 'O comprador pediu alterações. O criador tem um prazo novo para entregar.',
  AUTO_APPROVED: 'A entrega foi aprovada automaticamente por falta de resposta do comprador.',
  REFUND_REQUESTED: 'O prazo de entrega foi ultrapassado e o comprador pediu a devolução.',
  REFUNDED: 'O valor retido foi devolvido ao comprador.',
  COUNTER_OFFER_ACCEPTED: 'O comprador aceitou os termos novos. O pedido volta a estar com o criador.',
  COUNTER_OFFER_DECLINED: 'O comprador recusou os termos novos.',
  DISPUTE_OPENED: 'Foi aberta uma disputa. A NaDM vai analisar e decidir.',
  DISPUTE_WITHDRAWN: 'A disputa foi retirada. O pedido segue o seu caminho normal.',
  DISPUTE_RESOLVED_BUYER: 'A NaDM decidiu a favor do comprador. O valor é devolvido.',
  DISPUTE_RESOLVED_CREATOR: 'A NaDM decidiu a favor do criador. O pedido segue o seu caminho normal.',
  CONTENT_UNLOCKED: 'Conteúdo desbloqueado. Já podes vê-lo no perfil do criador.',
} as const satisfies Record<string, string>;

/**
 * A contraproposta escrita na conversa, com os números lá dentro.
 *
 * Não é um texto fixo como as outras transições porque o que interessa aqui
 * **são** os valores: quem lê a conversa daqui a um mês tem de ver o que foi
 * pedido, sem ir a nenhuma tabela à parte.
 */
export function counterOfferBody(price: Money, slaHours: number): string {
  return `O criador propôs ${formatKwanza(price)} e ${slaHours}h de prazo. Podes aceitar ou recusar.`;
}

/**
 * Separador de milhares: espaço inquebrável, para o valor nunca partir de linha
 * ao meio. É a mesma convenção do design e de `apps/web/src/lib/money.ts`.
 */
const SEPARADOR_MILHAR = '\u00a0';

/**
 * Kwanzas por aritmética de inteiros — nunca `toFixed` nem divisão flutuante.
 *
 * Os cêntimos só aparecem quando existem: escondê-los sempre seria mentir sobre
 * o valor, mostrá-los sempre seria ruído num mercado de kwanzas redondos. É o
 * mesmo critério de `formatMoney` no frontend.
 */
function formatKwanza(value: Money): string {
  const centimos = value.amountMinor < 0n ? -value.amountMinor : value.amountMinor;
  const agrupado = (centimos / 100n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, SEPARADOR_MILHAR);

  const resto = centimos % 100n;
  const decimais = resto === 0n ? '' : `,${resto.toString().padStart(2, '0')}`;

  return `${value.amountMinor < 0n ? '−' : ''}${agrupado}${decimais}${SEPARADOR_MILHAR}Kz`;
}
