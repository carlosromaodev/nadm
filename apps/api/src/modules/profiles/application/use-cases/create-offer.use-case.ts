import { Injectable } from '@nestjs/common';
import { BusinessRuleError, ResourceNotFoundError } from '@/core/errors/domain-error';
import { AuditLogRepository } from '@/shared/application/ports/audit-log.repository';
import { IdGenerator } from '@/shared/application/ports/id-generator';
import { TransactionRunner } from '@/shared/application/transaction';
import { Money } from '@/shared/domain/money';
import type { Offer } from '../../domain/profile';
import { OffersRepository, ProfilesRepository } from '../ports/profiles.repository';

export interface CreateOfferInput {
  actorUserId: string;
  kind?: 'CUSTOM_SERVICE' | 'DIRECT_MESSAGE' | 'BOOKING';
  title: string;
  description?: string | null;
  /** Cêntimos, como string de inteiro. Ver RN-111. */
  priceMinor: string;
  slaHours: number;
  revisionsIncluded?: number;
  requiresBrief?: boolean;
}

/** BOOKING regista um pedido de horário; a confirmação é feita pelo criador. */
@Injectable()
export class CreateOfferUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly offers: OffersRepository,
    private readonly profiles: ProfilesRepository,
    private readonly auditLog: AuditLogRepository,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: CreateOfferInput): Promise<Offer> {
    const price = Money.fromMinor(input.priceMinor);

    if (price.isNegative) {
      throw new BusinessRuleError('Offer price cannot be negative');
    }

    if (input.slaHours <= 0) {
      throw new BusinessRuleError('Offer needs a positive delivery window');
    }

    if (input.title.trim().length < 3) throw new BusinessRuleError('O título deve ter pelo menos 3 caracteres.');

    return this.transactions.run(async (tx) => {
      const profile = await this.profiles.findByUserId(input.actorUserId, tx);

      if (!profile) {
        throw new ResourceNotFoundError('Profile', input.actorUserId);
      }

      const offer = await this.offers.create(
        {
          id: this.ids.next(),
          profileId: profile.id,
          kind: input.kind ?? 'CUSTOM_SERVICE',
          title: input.title.trim(),
          description: input.description?.trim() || null,
          priceMinor: price.amountMinor,
          currency: price.currency,
          slaHours: input.slaHours,
          revisionsIncluded: input.revisionsIncluded ?? 1,
          requiresBrief: input.requiresBrief ?? true,
        },
        tx,
      );

      await this.auditLog.record(
        {
          actorUserId: input.actorUserId,
          actorKind: 'USER',
          action: 'offer.created',
          subjectType: 'Offer',
          subjectId: offer.id,
          metadata: { priceMinor: offer.priceMinor.toString() },
        },
        tx,
      );

      return offer;
    });
  }
}
