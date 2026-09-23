import {
  BusinessRuleError,
  ForbiddenActionError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '@/core/errors/domain-error';
import type { DealStatus, EscrowStatus } from './deal-status';

/**
 * Um `Deal` que o utilizador não pode ver e um `Deal` que não existe produzem
 * exactamente o mesmo erro, e por isso a mesma resposta 404. Confirmar que o
 * recurso existe já é informação a mais sobre um negócio alheio (RN-063).
 */
export class DealNotFoundError extends ResourceNotFoundError {
  constructor(id: string) {
    super('Deal', id);
  }
}

/**
 * O actor é parte do negócio mas não é quem pode accionar esta transição — o
 * comprador a tentar entregar, o criador a tentar aprovar. Aqui a existência do
 * recurso já não é segredo para ele, por isso é 403 e não 404.
 */
export class NotDealCreatorError extends ForbiddenActionError {
  constructor() {
    super('Only the creator of this deal can perform this action');
  }
}

export class NotDealBuyerError extends ForbiddenActionError {
  constructor() {
    super('Only the buyer of this deal can perform this action');
  }
}

export class InvalidDealTransitionError extends BusinessRuleError {
  constructor(from: DealStatus, to: DealStatus) {
    super(`Deal cannot move from ${from} to ${to}`);
  }
}

export class InvalidEscrowTransitionError extends BusinessRuleError {
  constructor(from: EscrowStatus, to: EscrowStatus) {
    super(`Escrow cannot move from ${from} to ${to}`);
  }
}

/** RN-040 */
export class SelfDealError extends BusinessRuleError {
  constructor() {
    super('A creator cannot buy from their own profile');
  }
}

export class BriefRequiredError extends BusinessRuleError {
  constructor() {
    super('This offer requires a brief');
  }
}

export class DealProposalExpiredError extends BusinessRuleError {
  constructor() {
    super('The proposal window has closed');
  }
}

/**
 * O criador só decide sobre pedidos já pagos: o dinheiro é retido na criação e
 * é isso que garante que ninguém trabalha sem garantia. Ver DP-15.
 */
export class PaymentRequiredError extends BusinessRuleError {
  constructor() {
    super('This deal has not been paid yet');
  }
}

export class OfferNotAvailableError extends BusinessRuleError {
  constructor(status: string) {
    super(`Offer is not available for new deals (status: ${status})`);
  }
}

export class ConversationClosedError extends BusinessRuleError {
  constructor() {
    super('This conversation is closed to new messages');
  }
}

export class DuplicateMessageError extends ResourceConflictError {
  constructor(clientId: string) {
    super(`A message with clientId "${clientId}" already exists in this deal`);
  }
}

/**
 * RN-044 — as revisões incluídas na oferta acabaram.
 *
 * Não é um bloqueio sem saída: o caminho a partir daqui é a disputa, que chega
 * em F6. Até lá, a mensagem tem de o dizer sem prometer o que ainda não existe.
 */
export class RevisionsExhaustedError extends BusinessRuleError {
  constructor(revisionsIncluded: number) {
    super(
      `This offer includes ${revisionsIncluded} revision(s), and they have all been used`,
    );
  }
}

/** Rejeitar uma entrega sem dizer porquê deixa o criador sem nada para corrigir. */
export class RejectionReasonRequiredError extends BusinessRuleError {
  constructor() {
    super('Rejecting a delivery requires a reason');
  }
}

/** O prazo ainda não passou: expirar agora seria roubar tempo ao criador. */
export class DealNotExpiredError extends BusinessRuleError {
  constructor() {
    super('The proposal window has not closed yet');
  }
}

/**
 * O direito à devolução por atraso nasce do tempo, e o tempo ainda não passou.
 * Ver a tolerância de 48 h sobre `dueAt` em SDD §5.1.
 */
export class RefundNotDueError extends BusinessRuleError {
  constructor() {
    super('This deal is not late enough to be refunded');
  }
}

/** Contrapropor exactamente os mesmos termos não é negociar, é ruído. */
export class CounterOfferUnchangedError extends BusinessRuleError {
  constructor() {
    super('A counter-offer must change the price, the deadline, or both');
  }
}

/**
 * Não há contraproposta por responder neste pedido.
 *
 * É 409 e não 404: quem pergunta é parte do negócio e já sabe que ele existe —
 * o que não existe é a contraproposta que ele julgava estar à espera.
 */
export class NoPendingCounterOfferError extends ResourceConflictError {
  constructor() {
    super('This deal has no counter-offer waiting for an answer');
  }
}
