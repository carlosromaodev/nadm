import type { Money } from '@/shared/domain/money';
import type { CounterOffer } from '../domain/counter-offer';
import type { Deal } from '../domain/deal';
import type { Dispute } from '../domain/dispute';
import type { Delivery } from '../domain/delivery';
import type { Message } from '../domain/message';

/** Dinheiro sai sempre como string de inteiro em cêntimos (RN-111). */
function money(value: Money) {
  return { amount: value.amountMinor.toString(), currency: value.currency };
}

export interface DealPresentationPolicy {
  /** Tolerância sobre `dueAt` antes de o comprador poder pedir devolução (T16). */
  lateDeliveryGraceHours: number;
}

export function presentDeal(deal: Deal, policy?: DealPresentationPolicy) {
  const props = deal.toProps();

  return {
    id: props.id,
    reference: props.reference,
    status: props.status,
    escrowStatus: props.escrowStatus,
    // A repartição completa, porque o ecrã de pagamento tem de a mostrar linha
    // a linha: preço, taxa da NaDM e total. Ver P7 do design.
    price: money(deal.price),
    buyerFee: money(deal.buyerFee),
    amount: money(props.amount),
    platformFee: money(props.platformFee),
    creatorFee: money(deal.creatorFee),
    creatorNet: money(props.creatorNet),
    offer: {
      id: props.offerSnapshot.offerId,
      title: props.offerSnapshot.title,
      kind: props.offerSnapshot.kind,
      slaHours: props.offerSnapshot.slaHours,
      revisionsIncluded: props.offerSnapshot.revisionsIncluded,
    },
    brief: props.brief,
    // A versão do acordo em vigor: 1 no original, e mais um a cada
    // contraproposta aceite.
    offerVersion: props.offerSnapshot.version ?? 1,
    // O ecrã da entrega precisa de saber quantas voltas ainda há antes de a
    // única saída passar a ser a disputa (RN-044).
    revisionCount: props.revisionCount,
    revisionsRemaining: deal.revisionsRemaining,
    dueAt: props.dueAt?.toISOString() ?? null,
    // Quando o direito à devolução por atraso nasce. A regra do prazo é do
    // servidor; a interface só lê a data e compara com o relógio.
    refundableFrom: policy
      ? (deal.refundableFrom(policy.lateDeliveryGraceHours)?.toISOString() ?? null)
      : null,
    expiresAt: props.expiresAt?.toISOString() ?? null,
    acceptedAt: props.acceptedAt?.toISOString() ?? null,
    deliveredAt: props.deliveredAt?.toISOString() ?? null,
    approvedAt: props.approvedAt?.toISOString() ?? null,
    settledAt: props.settledAt?.toISOString() ?? null,
    closedAt: props.closedAt?.toISOString() ?? null,
    lastMessageAt: props.lastMessageAt?.toISOString() ?? null,
    createdAt: props.createdAt.toISOString(),
  };
}

export function presentCounterOffer(counterOffer: CounterOffer) {
  return {
    id: counterOffer.id,
    price: money(counterOffer.price),
    slaHours: counterOffer.slaHours,
    message: counterOffer.message,
    status: counterOffer.status,
    expiresAt: counterOffer.expiresAt.toISOString(),
    resolvedAt: counterOffer.resolvedAt?.toISOString() ?? null,
    createdAt: counterOffer.createdAt.toISOString(),
  };
}

export function presentMessage(message: Message) {
  return {
    id: message.id,
    kind: message.kind,
    senderUserId: message.senderUserId,
    body: message.body,
    clientId: message.clientId,
    readAt: message.readAt?.toISOString() ?? null,
    createdAt: message.createdAt.toISOString(),
  };
}

export function presentDelivery(delivery: Delivery) {
  return {
    id: delivery.id,
    version: delivery.version,
    note: delivery.note,
    submittedAt: delivery.submittedAt.toISOString(),
    acceptedAt: delivery.acceptedAt?.toISOString() ?? null,
    rejectedAt: delivery.rejectedAt?.toISOString() ?? null,
    rejectionReason: delivery.rejectionReason,
  };
}


export function presentDispute(dispute: Dispute) {
  const props = dispute.toProps();

  return {
    id: props.id,
    status: props.status,
    resolution: props.resolution,
    reason: props.reason,
    decisionNote: props.decisionNote,
    openedByUserId: props.openedByUserId,
    openedAt: props.openedAt.toISOString(),
    decidedAt: props.decidedAt?.toISOString() ?? null,
  };
}
