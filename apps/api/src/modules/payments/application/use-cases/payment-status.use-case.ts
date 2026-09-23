import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '@/core/clock/clock';
import { BusinessRuleError, ResourceNotFoundError } from '@/core/errors/domain-error';
import { DealsRepository } from '@/modules/deals/application/ports/deals.repository';
import { requireBuyer, requireParticipant } from '@/modules/deals/application/use-cases/deal-access';
import { Money } from '@/shared/domain/money';
import { PaymentIntentsRepository } from '../ports/payments.repository';
import { HandlePaymentCapturedUseCase } from './handle-payment-captured.use-case';

export const DEVELOPMENT_PAYMENTS_ENABLED = Symbol('DEVELOPMENT_PAYMENTS_ENABLED');

@Injectable()
export class GetPaymentStatusUseCase {
  constructor(private readonly deals: DealsRepository, private readonly intents: PaymentIntentsRepository) {}
  async execute(input: { actorUserId: string; dealId: string; intentId: string }) {
    requireBuyer(requireParticipant(await this.deals.findById(input.dealId), input.actorUserId, input.dealId), input.actorUserId);
    const intent = await this.intents.findById(input.intentId);
    if (!intent || intent.dealId !== input.dealId) throw new ResourceNotFoundError('PaymentIntent', input.intentId);
    return intent;
  }
}

/** Explicit local simulator, never a substitute for confirmation by a real PSP. */
@Injectable()
export class SimulatePaymentUseCase {
  constructor(
    private readonly status: GetPaymentStatusUseCase,
    private readonly capture: HandlePaymentCapturedUseCase,
    private readonly clock: Clock,
    @Inject(DEVELOPMENT_PAYMENTS_ENABLED) private readonly enabled: boolean,
  ) {}
  async execute(input: { actorUserId: string; dealId: string; intentId: string }) {
    if (!this.enabled) throw new ResourceNotFoundError('PaymentIntent', input.intentId);
    const intent = await this.status.execute(input);
    if (intent.provider !== 'fake') throw new BusinessRuleError('Real payments cannot be simulated');
    if (intent.status === 'CAPTURED') return { outcome: 'already_processed' };
    if (intent.status !== 'PENDING' || intent.expiresAt <= this.clock.now()) throw new BusinessRuleError('Only a pending, unexpired test payment can be confirmed');
    const outcome = await this.capture.execute({
      providerEventId: `dev-capture:${intent.id}`,
      providerReference: intent.providerReference,
      type: 'payment.captured',
      capturedAmount: Money.fromMinor(intent.amountMinor, 'AOA'),
      occurredAt: this.clock.now(),
      raw: { simulation: true, intentId: intent.id },
    });
    return { outcome };
  }
}
