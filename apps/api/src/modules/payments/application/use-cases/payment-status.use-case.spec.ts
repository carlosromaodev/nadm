import { beforeEach, describe, expect, it } from 'vitest';
import { BusinessRuleError, ResourceNotFoundError } from '@/core/errors/domain-error';
import { DealNotFoundError, NotDealBuyerError } from '@/modules/deals/domain/errors';
import { makeJourney } from '@/shared/testing/deal-journey';
import { makeTestContext, type TestContext } from '@/shared/testing/test-context';
import { GetPaymentStatusUseCase, SimulatePaymentUseCase } from './payment-status.use-case';

describe('server-confirmed development payments', () => {
  let ctx: TestContext;
  let journey: ReturnType<typeof makeJourney>;
  let status: GetPaymentStatusUseCase;
  let simulate: SimulatePaymentUseCase;
  beforeEach(() => {
    ctx = makeTestContext(); journey = makeJourney(ctx);
    ctx.seedUser({ id: 'buyer' }); ctx.seedUser({ id: 'outsider' });
    ctx.seedCreator({ id: 'creator', handle: 'nelsonbeats' });
    ctx.seedOffer({ id: 'offer-1', profileId: 'profile-creator' });
    status = new GetPaymentStatusUseCase(ctx.deals, ctx.paymentIntents);
    simulate = new SimulatePaymentUseCase(status, journey.handleCapture, ctx.clock, true);
  });
  async function pending(phone = '+244923000000') {
    const deal = await journey.advanceTo('PROPOSED');
    const { intent } = await journey.startPayment.execute({ actorUserId: 'buyer', dealId: deal.id, payerPhone: phone, idempotencyKey: `test:${deal.id}` });
    return { actorUserId: 'buyer', dealId: deal.id, intentId: intent.id };
  }
  it('reads persisted status and price without confirming', async () => {
    const input = await pending();
    expect(await status.execute(input)).toMatchObject({ status: 'PENDING', amountMinor: 5_250_000n });
    expect((await ctx.deals.findById(input.dealId))?.escrowStatus).toBe('PENDING');
  });
  it('captures once through the existing transaction without accepting the work', async () => {
    const input = await pending(); await simulate.execute(input); await simulate.execute(input);
    expect((await ctx.deals.findById(input.dealId))?.escrowStatus).toBe('HELD');
    expect((await ctx.deals.findById(input.dealId))?.status).toBe('PROPOSED');
    expect((await status.execute(input)).status).toBe('CAPTURED');
    expect(ctx.db.paymentEvents.size).toBe(1);
  });
  it('returns 404 to non-participants and prevents creator confirmation', async () => {
    const input = await pending();
    await expect(status.execute({ ...input, actorUserId: 'outsider' })).rejects.toThrow(DealNotFoundError);
    await expect(simulate.execute({ ...input, actorUserId: 'outsider' })).rejects.toThrow(DealNotFoundError);
    await expect(simulate.execute({ ...input, actorUserId: 'creator' })).rejects.toThrow(NotDealBuyerError);
  });
  it('does not expose an absent intent or one from another deal', async () => {
    const a = await pending(); const b = await pending();
    await expect(status.execute({ ...a, intentId: b.intentId })).rejects.toThrow(ResourceNotFoundError);
    await expect(status.execute({ ...a, intentId: 'missing' })).rejects.toThrow(ResourceNotFoundError);
  });
  it('is unavailable when disabled', async () => {
    const input = await pending();
    await expect(new SimulatePaymentUseCase(status, journey.handleCapture, ctx.clock, false).execute(input)).rejects.toThrow(ResourceNotFoundError);
    expect((await status.execute(input)).status).toBe('PENDING');
  });
  it.each(['+244900000011', '+244900000022'])('rejects terminal state %s', async phone => {
    const input = await pending(phone);
    await expect(simulate.execute(input)).rejects.toThrow(BusinessRuleError);
    expect((await ctx.deals.findById(input.dealId))?.escrowStatus).toBe('PENDING');
  });
  it('rejects expired pending intents', async () => {
    const input = await pending(); ctx.clock.advanceMinutes(31);
    await expect(simulate.execute(input)).rejects.toThrow(BusinessRuleError);
  });
});
