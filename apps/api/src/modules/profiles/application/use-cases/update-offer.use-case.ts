import { Injectable } from '@nestjs/common';
import { BusinessRuleError, ResourceNotFoundError } from '@/core/errors/domain-error';
import { AuditLogRepository } from '@/shared/application/ports/audit-log.repository';
import { TransactionRunner } from '@/shared/application/transaction';
import { Money } from '@/shared/domain/money';
import { OffersRepository, ProfilesRepository, type UpdateOfferInput } from '../ports/profiles.repository';

export interface EditOfferInput extends Omit<UpdateOfferInput, 'priceMinor'> { priceMinor?: string }

@Injectable()
export class UpdateOfferUseCase {
  constructor(private readonly transactions: TransactionRunner, private readonly profiles: ProfilesRepository,
    private readonly offers: OffersRepository, private readonly audit: AuditLogRepository) {}

  async execute(actorUserId: string, offerId: string, input: EditOfferInput) {
    const price = input.priceMinor === undefined ? undefined : Money.fromMinor(input.priceMinor);
    if (price?.isNegative) throw new BusinessRuleError('O preço não pode ser negativo.');
    if (input.slaHours !== undefined && (!Number.isInteger(input.slaHours) || input.slaHours <= 0)) {
      throw new BusinessRuleError('O prazo de entrega deve ser positivo.');
    }
    if (input.title !== undefined && input.title.trim().length < 3) throw new BusinessRuleError('O título deve ter pelo menos 3 caracteres.');
    return this.transactions.run(async (tx) => {
      const profile = await this.profiles.findByUserId(actorUserId, tx);
      const offer = await this.offers.findById(offerId, tx);
      if (!profile || !offer || offer.profileId !== profile.id || offer.status === 'ARCHIVED') {
        throw new ResourceNotFoundError('Offer', offerId);
      }
      const { priceMinor: _priceMinor, ...fields } = input;
      const updated = await this.offers.update(offer.id, {
        ...fields,
        ...(price ? { priceMinor: price.amountMinor } : {}),
        ...(input.title === undefined ? {} : { title: input.title.trim() }),
        ...(input.description === undefined ? {} : { description: input.description?.trim() || null }),
      }, tx);
      await this.audit.record({ actorUserId, actorKind: 'USER', action: 'offer.updated', subjectType: 'Offer', subjectId: offer.id,
        metadata: { fields: Object.keys(input) } }, tx);
      return updated;
    });
  }
}
