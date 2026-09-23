import { Injectable } from '@nestjs/common';
import { Clock } from '@/core/clock/clock';
import { BusinessRuleError, ResourceConflictError, ResourceNotFoundError } from '@/core/errors/domain-error';
import { DealsRepository } from '@/modules/deals/application/ports/deals.repository';
import { requireBuyer, requireParticipant } from '@/modules/deals/application/use-cases/deal-access';
import { ProfilesRepository } from '@/modules/profiles/application/ports/profiles.repository';
import { isPublished } from '@/modules/profiles/domain/profile';
import { AuditLogRepository } from '@/shared/application/ports/audit-log.repository';
import { IdGenerator } from '@/shared/application/ports/id-generator';
import { TransactionRunner } from '@/shared/application/transaction';
import {
  EmptyReplyError,
  NotReviewedCreatorError,
  ReviewAlreadyRepliedError,
  rateProfile,
  type ProfileRating,
} from '../../domain/review';
import { ReviewsRepository } from '../ports/reviews.repository';

@Injectable()
export class SubmitReviewUseCase {
  constructor(private readonly transactions: TransactionRunner, private readonly deals: DealsRepository, private readonly reviews: ReviewsRepository, private readonly audit: AuditLogRepository, private readonly ids: IdGenerator, private readonly clock: Clock) {}
  async execute(input: { actorUserId: string; dealId: string; rating: number; body: string }) {
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5 || input.body.trim().length > 2000) throw new BusinessRuleError('Escolhe uma nota entre 1 e 5 e escreve até 2000 caracteres.');
    return this.transactions.run(async tx => {
      const deal = requireBuyer(requireParticipant(await this.deals.findById(input.dealId, tx), input.actorUserId, input.dealId), input.actorUserId);
      if (!['APPROVED', 'PAID'].includes(deal.status)) throw new BusinessRuleError('Só podes avaliar um trabalho aprovado.');
      const existing = await this.reviews.findByDeal(deal.id, tx);
      if (existing) {
        if (existing.rating !== input.rating || existing.body !== input.body.trim()) throw new ResourceConflictError('Este pedido já tem uma avaliação.');
        return existing;
      }
      const id = this.ids.next();
      const review = await this.reviews.createIfAbsent({ id, dealId: deal.id, authorUserId: input.actorUserId, profileId: deal.creatorProfileId, rating: input.rating, body: input.body.trim(), reply: null, repliedAt: null, publishedAt: this.clock.now() }, tx);
      if (review.rating !== input.rating || review.body !== input.body.trim()) throw new ResourceConflictError('Este pedido já tem uma avaliação.');
      if (review.id === id) await this.audit.record({ actorUserId: input.actorUserId, actorKind: 'USER', action: 'review.created', subjectType: 'Review', subjectId: review.id, metadata: { dealId: deal.id, rating: review.rating } }, tx);
      return review;
    });
  }
}
@Injectable()
export class GetDealReviewUseCase {
  constructor(private readonly deals: DealsRepository, private readonly reviews: ReviewsRepository) {}
  async execute(input: { actorUserId: string; dealId: string }) {
    requireParticipant(await this.deals.findById(input.dealId), input.actorUserId, input.dealId);
    return this.reviews.findByDeal(input.dealId);
  }
}
@Injectable()
export class ListProfileReviewsUseCase {
  constructor(private readonly profiles: ProfilesRepository, private readonly reviews: ReviewsRepository) {}
  async execute(handle: string) {
    const profile = await this.profiles.findByHandle(handle);
    if (!profile || !isPublished(profile)) throw new ResourceNotFoundError('Profile', handle);
    if (profile.settings?.showReviews === false) return [];
    return this.reviews.listByProfile(profile.id);
  }
}

/**
 * O criador responde à avaliação. **Uma vez, e não apaga.**
 *
 * A reputação de um criador não é editável por ele: o que ele pode fazer é
 * acrescentar a sua versão ao lado da do comprador, e é isso que a resposta é.
 */
@Injectable()
export class ReplyToReviewUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly reviews: ReviewsRepository,
    private readonly profiles: ProfilesRepository,
    private readonly audit: AuditLogRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: { actorUserId: string; dealId: string; reply: string }) {
    const reply = input.reply.trim();

    if (!reply || reply.length > 2000) {
      throw new EmptyReplyError();
    }

    return this.transactions.run(async (tx) => {
      const review = await this.reviews.findByDeal(input.dealId, tx);

      if (!review) {
        throw new ResourceNotFoundError('Review', input.dealId);
      }

      const profile = await this.profiles.findByUserId(input.actorUserId, tx);

      if (!profile || profile.id !== review.profileId) {
        throw new NotReviewedCreatorError();
      }

      if (review.reply !== null) {
        throw new ReviewAlreadyRepliedError();
      }

      const answered = await this.reviews.saveReply(review.id, reply, this.clock.now(), tx);

      await this.audit.record(
        {
          actorUserId: input.actorUserId,
          actorKind: 'USER',
          action: 'review.replied',
          subjectType: 'Review',
          subjectId: review.id,
          metadata: { dealId: input.dealId },
        },
        tx,
      );

      return answered;
    });
  }
}

/** A média pública de um perfil, em décimas e em inteiros. */
@Injectable()
export class GetProfileRatingUseCase {
  constructor(private readonly reviews: ReviewsRepository) {}

  async execute(profileId: string): Promise<ProfileRating> {
    const reviews = await this.reviews.listByProfile(profileId);

    return rateProfile(reviews.map((review) => review.rating));
  }
}
