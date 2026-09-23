import type { ChannelKind, Party } from './notification';

export interface MatrixEntry {
  /** Quem recebe. Vazio significa que o evento não notifica ninguém. */
  readonly to: readonly Party[];
  readonly channels: readonly ChannelKind[];
  /** O texto que se envia. Os templates concretos chegam com DP-03. */
  readonly template: string;
}

/**
 * A matriz de eventos do SDD §14.2, como dados.
 *
 * Está aqui em vez de espalhada por `if`s porque é uma **decisão de produto**,
 * não de código: quem é avisado de quê, e por onde. Mudá-la deve ser editar uma
 * linha desta tabela, e ver a tabela deve chegar para responder à pergunta.
 *
 * Um evento que não está aqui não notifica ninguém, e é de propósito: os
 * eventos de operação — `payment.amount_mismatch`, `reconciliation.*` — são
 * para a administração ver no painel, não para acordar um criador.
 */
export const EVENT_MATRIX: Readonly<Record<string, MatrixEntry>> = {
  // ── o ciclo do pedido ────────────────────────────────────────────────────
  'deal.created': {
    to: ['creator'],
    channels: ['PUSH', 'SMS'],
    template: 'deal.created',
  },
  'payment.captured': {
    // O comprador recebe o recibo; o criador fica a saber que pode decidir.
    to: ['buyer', 'creator'],
    channels: ['PUSH'],
    template: 'payment.captured',
  },
  'deal.accepted': {
    to: ['buyer'],
    channels: ['PUSH', 'SMS'],
    template: 'deal.accepted',
  },
  'deal.declined': {
    to: ['buyer'],
    channels: ['PUSH', 'EMAIL'],
    template: 'deal.declined',
  },
  'deal.expired': {
    to: ['buyer', 'creator'],
    channels: ['PUSH'],
    template: 'deal.expired',
  },
  'delivery.submitted': {
    to: ['buyer'],
    channels: ['PUSH', 'EMAIL'],
    template: 'delivery.submitted',
  },
  'delivery.rejected': {
    to: ['creator'],
    channels: ['PUSH'],
    template: 'delivery.rejected',
  },
  'escrow.released': {
    to: ['creator'],
    channels: ['PUSH'],
    template: 'escrow.released',
  },
  'escrow.refunded': {
    to: ['buyer'],
    channels: ['PUSH'],
    template: 'escrow.refunded',
  },
  'deal.refunded': {
    to: ['creator'],
    channels: ['PUSH'],
    template: 'deal.refunded',
  },

  // ── negociação ───────────────────────────────────────────────────────────
  'deal.counter_offered': {
    to: ['buyer'],
    channels: ['PUSH', 'EMAIL'],
    template: 'deal.counter_offered',
  },
  'deal.counter_offer_accepted': {
    to: ['creator'],
    channels: ['PUSH'],
    template: 'deal.counter_offer_accepted',
  },
  'deal.counter_offer_declined': {
    to: ['creator'],
    channels: ['PUSH'],
    template: 'deal.counter_offer_declined',
  },

  // ── conversa ─────────────────────────────────────────────────────────────
  'message.created': {
    // Só a contraparte. Quem escreveu já sabe que escreveu — quem é a
    // contraparte decide-se no planeador, que sabe quem enviou.
    to: ['buyer', 'creator'],
    channels: ['PUSH'],
    template: 'message.created',
  },

  // ── disputa ──────────────────────────────────────────────────────────────
  'dispute.opened': {
    to: ['buyer', 'creator'],
    channels: ['PUSH', 'EMAIL'],
    template: 'dispute.opened',
  },
  'dispute.resolved': {
    to: ['buyer', 'creator'],
    channels: ['PUSH', 'EMAIL'],
    template: 'dispute.resolved',
  },
  'dispute.withdrawn': {
    to: ['buyer', 'creator'],
    channels: ['PUSH'],
    template: 'dispute.withdrawn',
  },
};

/**
 * Eventos que notificam alguém sem ser pelo `Deal`.
 *
 * O levantamento e a identidade são do criador e não têm duas partes; o
 * planeador trata-os à parte porque a matriz acima é toda sobre pedidos.
 */
export const DIRECT_MATRIX: Readonly<
  Record<string, { channels: readonly ChannelKind[]; template: string }>
> = {
  'payout.paid': { channels: ['PUSH', 'SMS'], template: 'payout.paid' },
  'payout.failed': { channels: ['PUSH'], template: 'payout.failed' },
  'identity.approved': { channels: ['PUSH'], template: 'identity.approved' },
  'identity.rejected': { channels: ['PUSH'], template: 'identity.rejected' },
  'user.suspended': { channels: ['EMAIL'], template: 'user.suspended' },
};
