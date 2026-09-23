import type { Deal } from '../../domain/deal';
import { DealNotFoundError, NotDealBuyerError, NotDealCreatorError } from '../../domain/errors';

/**
 * A pergunta que autoriza quase tudo no sistema: qual é a relação deste
 * utilizador com este `Deal`?
 *
 * Nenhuma parte: o recurso não existe para ele — 404, nunca 403, porque um 403
 * confirmaria a existência de um negócio alheio (RN-063).
 */
export function requireParticipant(deal: Deal | null, actorUserId: string, id: string): Deal {
  if (!deal || !deal.isParticipant(actorUserId)) {
    throw new DealNotFoundError(id);
  }

  return deal;
}

/** Parte, mas no papel errado: aí a existência já não é segredo — 403. */
export function requireCreator(deal: Deal, actorUserId: string): Deal {
  if (!deal.isCreator(actorUserId)) {
    throw new NotDealCreatorError();
  }

  return deal;
}

export function requireBuyer(deal: Deal, actorUserId: string): Deal {
  if (!deal.isBuyer(actorUserId)) {
    throw new NotDealBuyerError();
  }

  return deal;
}

/**
 * Sem actor nenhum a quem perguntar pela relação: é o agendador a agir sobre um
 * `Deal` que ele próprio acabou de ler da base de dados.
 *
 * Nunca deve ser usada num caminho que venha de um pedido HTTP. Aí a pergunta é
 * sempre `requireParticipant`.
 */
export function requireExistingDeal(deal: Deal | null, id: string): Deal {
  if (!deal) {
    throw new DealNotFoundError(id);
  }

  return deal;
}
