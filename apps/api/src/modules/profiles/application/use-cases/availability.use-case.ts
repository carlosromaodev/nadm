import { Injectable } from '@nestjs/common';
import { Clock } from '@/core/clock/clock';
import {
  BusinessRuleError,
  ResourceNotFoundError,
} from '@/core/errors/domain-error';
import { AuditLogRepository } from '@/shared/application/ports/audit-log.repository';
import { IdGenerator } from '@/shared/application/ports/id-generator';
import { TransactionRunner } from '@/shared/application/transaction';
import {
  openWindow,
  WindowInUseError,
  type AvailabilityWindow,
} from '../../domain/availability';
import { AvailabilityRepository } from '../ports/availability.repository';
import { OffersRepository, ProfilesRepository } from '../ports/profiles.repository';

export interface CreateWindowInput {
  actorUserId: string;
  offerId: string;
  startsAt: Date;
  endsAt: Date;
  slotsTotal: number;
}

/** Só uma oferta de marcação tem janelas; nas outras não haveria o que marcar. */
class NotABookingOfferError extends BusinessRuleError {
  constructor(kind: string) {
    super(`Only BOOKING offers have availability windows (this one is ${kind})`);
  }
}

class WindowInThePastError extends BusinessRuleError {
  constructor() {
    super('A window cannot end in the past');
  }
}

/**
 * O criador abre uma janela de marcação.
 *
 * A não sobreposição não é verificada aqui: é o `EXCLUDE` do Postgres que a
 * garante (RN-033), e o repositório traduz a violação. Verificar em aplicação
 * deixaria passar duas janelas inseridas ao mesmo tempo.
 */
@Injectable()
export class CreateAvailabilityWindowUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly windows: AvailabilityRepository,
    private readonly offers: OffersRepository,
    private readonly profiles: ProfilesRepository,
    private readonly auditLog: AuditLogRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: CreateWindowInput): Promise<AvailabilityWindow> {
    const now = this.clock.now();

    return this.transactions.run(async (tx) => {
      const profile = await this.profiles.findByUserId(input.actorUserId, tx);

      if (!profile) {
        throw new ResourceNotFoundError('Profile', input.actorUserId);
      }

      const offer = await this.offers.findById(input.offerId, tx);

      // Uma oferta de outro criador não existe para este: 404, como sempre.
      if (!offer || offer.profileId !== profile.id) {
        throw new ResourceNotFoundError('Offer', input.offerId);
      }

      if (offer.kind !== 'BOOKING') {
        throw new NotABookingOfferError(offer.kind);
      }

      if (input.endsAt <= now) {
        throw new WindowInThePastError();
      }

      const window = await this.windows.create(
        openWindow({
          id: this.ids.next(),
          profileId: profile.id,
          offerId: offer.id,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          slotsTotal: input.slotsTotal,
        }),
        tx,
      );

      await this.auditLog.record(
        {
          actorUserId: input.actorUserId,
          actorKind: 'USER',
          action: 'availability.window_created',
          subjectType: 'Offer',
          subjectId: offer.id,
          metadata: { windowId: window.id, slotsTotal: window.slotsTotal },
        },
        tx,
      );

      return window;
    });
  }
}

/** As janelas por acontecer de uma oferta. Leitura pública. */
@Injectable()
export class ListOfferWindowsUseCase {
  constructor(
    private readonly windows: AvailabilityRepository,
    private readonly clock: Clock,
  ) {}

  execute(offerId: string): Promise<AvailabilityWindow[]> {
    return this.windows.listUpcomingByOffer(offerId, this.clock.now());
  }
}

/** A agenda do próprio criador, por acontecer. */
@Injectable()
export class ListMyWindowsUseCase {
  constructor(
    private readonly windows: AvailabilityRepository,
    private readonly profiles: ProfilesRepository,
    private readonly clock: Clock,
  ) {}

  async execute(actorUserId: string): Promise<AvailabilityWindow[]> {
    const profile = await this.profiles.findByUserId(actorUserId);

    if (!profile) {
      throw new ResourceNotFoundError('Profile', actorUserId);
    }

    return this.windows.listUpcomingByProfile(profile.id, this.clock.now());
  }
}

/**
 * Apagar uma janela.
 *
 * **Só enquanto não tiver reservas.** Uma janela com vagas tomadas é um
 * compromisso com alguém, e apagá-la deixaria `Deal` a apontar para o vazio.
 */
@Injectable()
export class DeleteAvailabilityWindowUseCase {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly windows: AvailabilityRepository,
    private readonly profiles: ProfilesRepository,
    private readonly auditLog: AuditLogRepository,
  ) {}

  async execute(input: { actorUserId: string; windowId: string }): Promise<void> {
    return this.transactions.run(async (tx) => {
      const profile = await this.profiles.findByUserId(input.actorUserId, tx);
      const window = await this.windows.findById(input.windowId, tx);

      if (!profile || !window || window.profileId !== profile.id) {
        throw new ResourceNotFoundError('AvailabilityWindow', input.windowId);
      }

      if (window.slotsTaken > 0) {
        throw new WindowInUseError(window.slotsTaken);
      }

      await this.windows.delete(window.id, tx);

      await this.auditLog.record(
        {
          actorUserId: input.actorUserId,
          actorKind: 'USER',
          action: 'availability.window_deleted',
          subjectType: 'Offer',
          subjectId: window.offerId,
          metadata: { windowId: window.id },
        },
        tx,
      );
    });
  }
}
