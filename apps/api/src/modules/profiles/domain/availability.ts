import { BusinessRuleError, ResourceConflictError } from '@/core/errors/domain-error';
import type { AvailabilityStatus, Profile } from './profile';

/** Angola tem um único fuso, e é sobre ele que os prazos são lidos. */
export const LUANDA = 'Africa/Luanda';

export class InvalidWindowRangeError extends BusinessRuleError {
  constructor() {
    super('A window must end after it starts');
  }
}

export class InvalidSlotCountError extends BusinessRuleError {
  constructor() {
    super('A window needs at least one slot');
  }
}

/** RN-033 — duas janelas da mesma oferta não podem cobrir o mesmo instante. */
export class OverlappingWindowError extends BusinessRuleError {
  constructor() {
    super('This offer already has a window covering part of that period');
  }
}

/**
 * RN-031 — não há vagas.
 *
 * É 409 e não 422: o pedido está bem formado, e o que falhou foi a corrida por
 * um recurso escasso. Repetir daqui a um bocado pode dar outro resultado, e o
 * 409 é o que diz isso.
 */
export class NoSlotsAvailableError extends ResourceConflictError {
  constructor() {
    super('This window has no slots left');
  }
}

export class WindowAlreadyStartedError extends BusinessRuleError {
  constructor() {
    super('A window that has already started cannot be removed');
  }
}

export class WindowInUseError extends ResourceConflictError {
  constructor(slotsTaken: number) {
    super(`This window already has ${slotsTaken} booking(s) and cannot be removed`);
  }
}

export interface AvailabilityWindow {
  readonly id: string;
  readonly profileId: string;
  readonly offerId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly slotsTotal: number;
  readonly slotsTaken: number;
  readonly timezone: string;
}

export interface CreateWindowInput {
  id: string;
  profileId: string;
  offerId: string;
  startsAt: Date;
  endsAt: Date;
  slotsTotal: number;
}

/**
 * Valida uma janela antes de a gravar.
 *
 * A **não sobreposição** não se valida aqui, e é deliberado: é uma propriedade
 * do conjunto das janelas, não desta, e verificá-la em aplicação perderia a
 * corrida entre duas inserções simultâneas. Quem a garante é a restrição
 * `EXCLUDE` do Postgres — ver a migração 018.
 */
export function openWindow(input: CreateWindowInput): AvailabilityWindow {
  if (input.endsAt <= input.startsAt) {
    throw new InvalidWindowRangeError();
  }

  if (!Number.isInteger(input.slotsTotal) || input.slotsTotal < 1) {
    throw new InvalidSlotCountError();
  }

  return {
    id: input.id,
    profileId: input.profileId,
    offerId: input.offerId,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    slotsTotal: input.slotsTotal,
    slotsTaken: 0,
    timezone: LUANDA,
  };
}

export function hasFreeSlots(window: AvailabilityWindow): boolean {
  return window.slotsTaken < window.slotsTotal;
}

export function freeSlots(window: AvailabilityWindow): number {
  return Math.max(0, window.slotsTotal - window.slotsTaken);
}

/** Uma janela que ainda não acabou é a única que se pode reservar. */
export function isBookableAt(window: AvailabilityWindow, now: Date): boolean {
  return window.endsAt > now && hasFreeSlots(window);
}

/**
 * O estado de disponibilidade que se mostra, que **não é o que está guardado**.
 *
 * `PAUSED` é uma decisão explícita do criador e tem precedência: um perfil
 * pausado continua visível e não aceita pedidos, haja vagas ou não. `NO_SLOTS`
 * é derivado das janelas e recalculado a cada leitura — guardá-lo seria criar
 * uma segunda verdade sobre a mesma coisa, com a certeza de que as duas
 * divergiriam.
 *
 * `hasBookableSlots` é `null` quando o criador não tem ofertas de marcação
 * nenhumas: aí não há vagas por esgotar, e o estado é o que estiver guardado.
 */
export function derivedAvailability(
  profile: Profile,
  hasBookableSlots: boolean | null,
): AvailabilityStatus {
  if (profile.availabilityStatus === 'PAUSED') return 'PAUSED';
  if (hasBookableSlots === false) return 'NO_SLOTS';

  return 'AVAILABLE';
}
