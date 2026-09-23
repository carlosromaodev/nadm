import { BusinessRuleError, ForbiddenActionError } from '@/core/errors/domain-error';

export interface Review {
  id: string;
  dealId: string;
  authorUserId: string;
  profileId: string;
  rating: number;
  body: string;
  /** A resposta do criador. Uma só, e não se apaga. */
  reply: string | null;
  repliedAt: Date | null;
  publishedAt: Date;
}

/** O criador responde uma vez. Editar a resposta seria reescrever a história. */
export class ReviewAlreadyRepliedError extends BusinessRuleError {
  constructor() {
    super('This review has already been answered');
  }
}

export class NotReviewedCreatorError extends ForbiddenActionError {
  constructor() {
    super('Only the creator being reviewed can answer');
  }
}

export class EmptyReplyError extends BusinessRuleError {
  constructor() {
    super('An answer needs a body');
  }
}

export interface ProfileRating {
  /** Média das notas, em décimas de estrela: 47 é 4,7. Inteiro, nunca float. */
  averageTenths: number;
  count: number;
}

/**
 * A média das avaliações de um perfil, **em décimas e em inteiros**.
 *
 * Não é dinheiro, mas o princípio é o mesmo: uma média em vírgula flutuante
 * arredonda de maneiras diferentes conforme a plataforma, e uma reputação é
 * coisa que se compara. Quem apresenta divide por dez.
 */
export function rateProfile(ratings: readonly number[]): ProfileRating {
  if (ratings.length === 0) {
    return { averageTenths: 0, count: 0 };
  }

  const soma = ratings.reduce((total, rating) => total + rating, 0);

  // Arredonda à décima mais próxima, com aritmética inteira.
  return {
    averageTenths: Math.round((soma * 10) / ratings.length),
    count: ratings.length,
  };
}
