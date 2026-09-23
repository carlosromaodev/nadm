import type { TxContext } from '@/shared/application/transaction';
import type { AvailabilityWindow } from '../../domain/availability';

export abstract class AvailabilityRepository {
  abstract findById(id: string, tx?: TxContext): Promise<AvailabilityWindow | null>;

  /** Todas as janelas de uma oferta que ainda não acabaram, por ordem. */
  abstract listUpcomingByOffer(
    offerId: string,
    now: Date,
    tx?: TxContext,
  ): Promise<AvailabilityWindow[]>;

  abstract listUpcomingByProfile(
    profileId: string,
    now: Date,
    tx?: TxContext,
  ): Promise<AvailabilityWindow[]>;

  /**
   * Existe pelo menos uma vaga livre numa janela por acontecer deste perfil?
   *
   * `null` quando o perfil não tem ofertas de marcação nenhumas — aí não há
   * vagas por esgotar, e `NO_SLOTS` não se aplica.
   */
  abstract hasBookableSlots(
    profileId: string,
    now: Date,
    tx?: TxContext,
  ): Promise<boolean | null>;

  abstract create(window: AvailabilityWindow, tx?: TxContext): Promise<AvailabilityWindow>;

  /**
   * Reserva uma vaga, **atomicamente**.
   *
   * Devolve `false` quando já não havia nenhuma. Não é um `SELECT` seguido de
   * um `UPDATE`: é um `UPDATE` condicionado que ou incrementa ou não faz nada,
   * e é isso que resolve a corrida entre dois compradores pela última vaga
   * (RN-034) sem bloquear ninguém.
   */
  abstract takeSlot(id: string, tx?: TxContext): Promise<boolean>;

  /** Devolve a vaga quando o pedido morre antes de haver trabalho. */
  abstract releaseSlot(id: string, tx?: TxContext): Promise<void>;

  abstract delete(id: string, tx?: TxContext): Promise<void>;
}
