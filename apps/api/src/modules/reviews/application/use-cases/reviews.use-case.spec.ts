import { beforeEach, describe, expect, it } from 'vitest';
import { BusinessRuleError, ResourceConflictError, ResourceNotFoundError } from '@/core/errors/domain-error';
import { DealNotFoundError, NotDealBuyerError } from '@/modules/deals/domain/errors';
import { makeJourney } from '@/shared/testing/deal-journey';
import { makeTestContext, type TestContext } from '@/shared/testing/test-context';
import { rateProfile, type Review } from '../../domain/review';
import { ReviewsRepository } from '../ports/reviews.repository';
import {
  EmptyReplyError,
  NotReviewedCreatorError,
  ReviewAlreadyRepliedError,
} from '../../domain/review';
import {
  GetDealReviewUseCase,
  ListProfileReviewsUseCase,
  ReplyToReviewUseCase,
  SubmitReviewUseCase,
} from './reviews.use-case';

class MemoryReviews extends ReviewsRepository {
  rows: Review[] = [];
  async findByDeal(id: string) { return this.rows.find(row => row.dealId === id) ?? null; }
  async listByProfile(id: string) { return this.rows.filter(row => row.profileId === id); }
  async createIfAbsent(review: Review) { const existing = await this.findByDeal(review.dealId); if (existing) return existing; this.rows.push(review); return review; }
  async saveReply(id: string, reply: string, repliedAt: Date) {
    const index = this.rows.findIndex(row => row.id === id);
    this.rows[index] = { ...this.rows[index], reply, repliedAt };
    return this.rows[index];
  }
}
describe('Reviews RN-046/047', () => {
  let ctx: TestContext; let journey: ReturnType<typeof makeJourney>; let reviews: MemoryReviews;
  let submit: SubmitReviewUseCase; let get: GetDealReviewUseCase; let list: ListProfileReviewsUseCase;
  let reply: ReplyToReviewUseCase;
  beforeEach(() => {
    ctx = makeTestContext(); journey = makeJourney(ctx); reviews = new MemoryReviews();
    ctx.seedUser({ id: 'buyer' }); ctx.seedCreator({ id: 'creator', handle: 'nelsonbeats' }); ctx.seedOffer({ id: 'offer-1', profileId: 'profile-creator' });
    submit = new SubmitReviewUseCase(ctx.transactions, ctx.deals, reviews, ctx.auditLog, ctx.ids, ctx.clock);
    get = new GetDealReviewUseCase(ctx.deals, reviews); list = new ListProfileReviewsUseCase(ctx.profiles, reviews);
    reply = new ReplyToReviewUseCase(ctx.transactions, reviews, ctx.profiles, ctx.auditLog, ctx.clock);
  });
  it('publishes a buyer review and returns it from both views', async () => {
    const deal = await journey.advanceTo('PAID');
    const result = await submit.execute({ actorUserId: 'buyer', dealId: deal.id, rating: 5, body: ' Muito bom. ' });
    expect(result).toMatchObject({ rating: 5, body: 'Muito bom.', profileId: deal.creatorProfileId, authorUserId: 'buyer', publishedAt: ctx.clock.now() });
    expect(await get.execute({ actorUserId: 'creator', dealId: deal.id })).toEqual(result);
    expect(await list.execute('nelsonbeats')).toEqual([result]);
    expect(ctx.db.auditLog).toContainEqual(expect.objectContaining({ action: 'review.created', subjectId: result.id }));
  });
  it('replays identical review once and rejects different edits', async () => {
    const deal = await journey.advanceTo('PAID'); const input = { actorUserId: 'buyer', dealId: deal.id, rating: 4, body: 'Bom' };
    expect((await submit.execute(input)).id).toBe((await submit.execute(input)).id);
    await expect(submit.execute({ ...input, rating: 3 })).rejects.toThrow(ResourceConflictError);
    expect(reviews.rows).toHaveLength(1);
    expect(ctx.db.auditLog.filter(row => row.action === 'review.created')).toHaveLength(1);
  });
  it('rejects creator and outsiders, without exposing private deals', async () => {
    const deal = await journey.advanceTo('PAID'); const input = { actorUserId: 'creator', dealId: deal.id, rating: 5, body: '' };
    await expect(submit.execute(input)).rejects.toThrow(NotDealBuyerError);
    await expect(submit.execute({ ...input, actorUserId: 'other' })).rejects.toThrow(DealNotFoundError);
    await expect(get.execute({ actorUserId: 'other', dealId: deal.id })).rejects.toThrow(DealNotFoundError);
    expect(reviews.rows).toHaveLength(0);
  });
  it.each([0, 6, 1.5])('rejects invalid rating %s', async rating => {
    await expect(submit.execute({ actorUserId: 'buyer', dealId: 'missing', rating, body: '' })).rejects.toThrow(BusinessRuleError);
  });
  it('rejects too-long text and unfinished work', async () => {
    const deal = await journey.advanceTo('DELIVERED');
    await expect(submit.execute({ actorUserId: 'buyer', dealId: deal.id, rating: 5, body: 'x'.repeat(2001) })).rejects.toThrow(BusinessRuleError);
    await expect(submit.execute({ actorUserId: 'buyer', dealId: deal.id, rating: 5, body: '' })).rejects.toThrow(BusinessRuleError);
    expect(await get.execute({ actorUserId: 'buyer', dealId: deal.id })).toBeNull();
  });
  it('respects hidden reviews and unpublished profiles', async () => {
    const profile = ctx.db.profiles.get('profile-creator')!;
    ctx.db.profiles.set(profile.id, { ...profile, settings: { showReviews: false } });
    expect(await list.execute('nelsonbeats')).toEqual([]);
    ctx.db.profiles.set(profile.id, { ...profile, publishedAt: null });
    await expect(list.execute('nelsonbeats')).rejects.toThrow(ResourceNotFoundError);
    await expect(list.execute('missing')).rejects.toThrow(ResourceNotFoundError);
  });

  describe('a resposta do criador (F6)', () => {
    async function avaliado() {
      const deal = await journey.advanceTo('PAID');
      await submit.execute({ actorUserId: 'buyer', dealId: deal.id, rating: 4, body: 'Bom.' });
      return deal;
    }

    it('o criador responde, uma vez', async () => {
      const deal = await avaliado();

      const respondida = await reply.execute({
        actorUserId: 'creator',
        dealId: deal.id,
        reply: '  Obrigado!  ',
      });

      expect(respondida.reply).toBe('Obrigado!');
      expect(respondida.repliedAt).toEqual(ctx.clock.now());
      // A nota e o texto do comprador ficam intactos.
      expect(respondida.rating).toBe(4);
      expect(respondida.body).toBe('Bom.');
    });

    it('não responde duas vezes — a resposta não se edita', async () => {
      const deal = await avaliado();

      await reply.execute({ actorUserId: 'creator', dealId: deal.id, reply: 'Obrigado!' });

      await expect(
        reply.execute({ actorUserId: 'creator', dealId: deal.id, reply: 'Afinal não.' }),
      ).rejects.toThrow(ReviewAlreadyRepliedError);
    });

    it('só responde o criador avaliado — ao comprador devolve 403', async () => {
      const deal = await avaliado();

      await expect(
        reply.execute({ actorUserId: 'buyer', dealId: deal.id, reply: 'Eu respondo.' }),
      ).rejects.toThrow(NotReviewedCreatorError);
    });

    it('uma resposta vazia não é resposta', async () => {
      const deal = await avaliado();

      await expect(
        reply.execute({ actorUserId: 'creator', dealId: deal.id, reply: '   ' }),
      ).rejects.toThrow(EmptyReplyError);
    });

    it('responder a uma avaliação que não existe é 404', async () => {
      const deal = await journey.advanceTo('PAID');

      await expect(
        reply.execute({ actorUserId: 'creator', dealId: deal.id, reply: 'Obrigado!' }),
      ).rejects.toThrow(ResourceNotFoundError);
    });

    it('fica na auditoria', async () => {
      const deal = await avaliado();

      await reply.execute({ actorUserId: 'creator', dealId: deal.id, reply: 'Obrigado!' });

      expect(ctx.db.auditLog).toContainEqual(
        expect.objectContaining({ action: 'review.replied', actorUserId: 'creator' }),
      );
    });
  });

});

describe('rateProfile', () => {
  it('sem avaliações, não há média nem contagem', () => {
    expect(rateProfile([])).toEqual({ averageTenths: 0, count: 0 });
  });

  it('a média vai em décimas e em inteiros, nunca em vírgula flutuante', () => {
    // 4 + 5 + 5 = 14 / 3 = 4,666… → 47 décimas
    expect(rateProfile([4, 5, 5])).toEqual({ averageTenths: 47, count: 3 });
  });

  it('uma nota redonda dá uma média redonda', () => {
    expect(rateProfile([5, 5])).toEqual({ averageTenths: 50, count: 2 });
  });

  it('arredonda à décima mais próxima', () => {
    // 1 + 2 = 3 / 2 = 1,5 → 15 décimas
    expect(rateProfile([1, 2])).toEqual({ averageTenths: 15, count: 2 });
  });
});
