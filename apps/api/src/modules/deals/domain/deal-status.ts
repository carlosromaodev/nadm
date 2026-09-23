export const DEAL_STATUSES = [
  'PROPOSED',
  'COUNTER_OFFERED',
  'ACCEPTED',
  'IN_PROGRESS',
  'DELIVERED',
  'APPROVED',
  'PAID',
  'DECLINED',
  'REFUNDED',
  'EXPIRED',
] as const;

export type DealStatus = (typeof DEAL_STATUSES)[number];

export const ESCROW_STATUSES = ['PENDING', 'HELD', 'RELEASED', 'REFUNDED', 'FAILED'] as const;

export type EscrowStatus = (typeof ESCROW_STATUSES)[number];

/**
 * Transições do estado comercial.
 *
 * **O comprador paga antes de o criador aceitar.** O pedido nasce em
 * `PROPOSED`, o pagamento retém o dinheiro sem mudar o estado comercial, e o
 * criador só decide sobre um pedido já pago. É a ordem que o design desenha
 * (P6 → P7 → P8) e a decisão registada em DP-15.
 *
 * Implementadas em F1, o caminho feliz:
 *   T1  —               → PROPOSED     comprador propõe
 *   E1  escrow PENDING  → HELD         pagamento capturado, estado não muda
 *   T2  PROPOSED        → ACCEPTED     criador aceita um pedido já pago
 *   T7  ACCEPTED        → IN_PROGRESS  o trabalho arranca
 *   T8  IN_PROGRESS     → DELIVERED    criador entrega
 *   T9  DELIVERED       → APPROVED     comprador aprova
 *   T12 APPROVED        → PAID         escrow libertado
 *
 * Acrescentadas em F4, os caminhos de falha e os prazos:
 *   T3  PROPOSED        → DECLINED     criador recusa, com estorno se pago
 *   T10 DELIVERED       → APPROVED     sistema, 72 h sem resposta do comprador
 *   T11 DELIVERED       → IN_PROGRESS  comprador rejeita, dentro das revisões
 *   T13 PROPOSED        → EXPIRED      sistema, prazo de resposta esgotado
 *   T16 ACCEPTED        → REFUNDED     comprador pede devolução por atraso
 *       IN_PROGRESS     → REFUNDED
 *   E3  escrow HELD     → REFUNDED     estorno, em T3, T13 e T16
 *   E4  escrow PENDING  → FAILED       pedido morto sem nunca ter sido pago
 *
 * A contraproposta, com o acerto do dinheiro que DP-15 obriga:
 *   T4  PROPOSED        → COUNTER_OFFERED   criador pede outro preço ou prazo
 *   T5  COUNTER_OFFERED → PROPOSED          comprador aceita os termos novos
 *   T6  COUNTER_OFFERED → DECLINED          comprador recusa, com estorno
 *   T13 COUNTER_OFFERED → EXPIRED           sistema, resposta do comprador
 *
 * A disputa, que é a saída quando as partes discordam (F6):
 *   T15 ACCEPTED        → REFUNDED     admin decide a favor do comprador
 *       IN_PROGRESS     → REFUNDED
 *       DELIVERED       → REFUNDED
 *
 * **O acerto da contraproposta.** Com DP-15 o dinheiro está retido desde a
 * proposta, e mudar o preço deixa de ser mudar um número: o escrow tem de
 * passar a valer exactamente o valor novo. São três casos, e o mais comum no
 * design é o primeiro — o criador pede mais (350 000 → 420 000 no P14):
 *
 *   preço sobe    o comprador reforça a diferença, e **é a captura desse
 *                 reforço que dispara T5**. Enquanto não pagar, o pedido fica
 *                 em `COUNTER_OFFERED`. É a mesma ordem de DP-15: paga-se
 *                 primeiro, o estado muda depois.
 *   preço desce   estorno parcial da diferença, na mesma transacção que T5.
 *   preço igual   só o prazo mudou; não há dinheiro nenhum a mexer.
 *
 * **A contraproposta é do percurso das marcas.** O ecrã é o P14, com as três
 * saídas; o P23, onde o fã contrata, só tem aceitar, pedir detalhe e recusar.
 * As transições vivem aqui porque são do `Deal` e não do ecrã, mas quem as
 * expõe na interface é F8.
 */
export const DEAL_TRANSITIONS: Readonly<Record<DealStatus, readonly DealStatus[]>> = {
  PROPOSED: ['ACCEPTED', 'DECLINED', 'EXPIRED', 'COUNTER_OFFERED'],
  // Aceitar já arranca o trabalho: o dinheiro está retido desde o pagamento, e
  // não há acção nenhuma entre aceitar e começar. O "Em execução" do design é
  // uma leitura do tempo decorrido contra o prazo, não um estado à parte.
  ACCEPTED: ['DELIVERED', 'REFUNDED'],
  // `IN_PROGRESS` só se alcança por T11: uma entrega rejeitada devolve o
  // trabalho ao criador, com prazo novo.
  IN_PROGRESS: ['DELIVERED', 'REFUNDED'],
  // `REFUNDED` a partir de `DELIVERED` é T15, e só por decisão da
  // administração: uma entrega submetida não se desfaz por vontade de uma parte.
  DELIVERED: ['APPROVED', 'IN_PROGRESS', 'REFUNDED'],
  APPROVED: ['PAID'],
  // Voltar a `PROPOSED` é o que põe o pedido outra vez em cima da mesa, agora
  // com os termos novos e o escrow a valer exactamente o valor novo.
  COUNTER_OFFERED: ['PROPOSED', 'DECLINED', 'EXPIRED'],
  PAID: [],
  DECLINED: [],
  REFUNDED: [],
  EXPIRED: [],
};

/** Transições do estado do dinheiro: E1 a E4 de SDD §5.2. */
export const ESCROW_TRANSITIONS: Readonly<Record<EscrowStatus, readonly EscrowStatus[]>> = {
  // E1 captura, E4 o pedido morre antes de alguém pagar.
  PENDING: ['HELD', 'FAILED'],
  // E2 libertação e E3 estorno são as duas únicas saídas de HELD (SDD §11).
  HELD: ['RELEASED', 'REFUNDED'],
  RELEASED: [],
  REFUNDED: [],
  FAILED: [],
};

export const TERMINAL_DEAL_STATUSES: readonly DealStatus[] = [
  'PAID',
  'DECLINED',
  'REFUNDED',
  'EXPIRED',
];

export function isTerminal(status: DealStatus): boolean {
  return TERMINAL_DEAL_STATUSES.includes(status);
}
