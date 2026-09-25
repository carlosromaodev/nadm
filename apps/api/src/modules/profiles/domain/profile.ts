import { Money } from '@/shared/domain/money';
import type { OfferKind, OfferSnapshot } from '@/modules/deals/domain/deal';
import { OfferNotAvailableError } from '@/modules/deals/domain/errors';

export type AvailabilityStatus = 'AVAILABLE' | 'NO_SLOTS' | 'PAUSED';

export type OfferStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';

/** Preferências do criador, privadas excepto os campos seleccionados no presenter. */
export interface ProfileSettings {
  theme?: 'dark' | 'light';
  category?: string;
  location?: string;
  /** Fotografia pública do criador. Nas sementes aponta para um asset local. */
  avatarUrl?: string;
  /** Sinais públicos e editáveis usados na descoberta. */
  responseTimeHours?: number;
  completedDeals?: number;
  acceptsBrands?: boolean;
  verified?: boolean;
  whoCanMessage?: 'everyone' | 'members' | 'customers';
  showActivity?: boolean;
  showReviews?: boolean;
  showEarnings?: boolean;
  notifications?: boolean;
  publicVisible?: boolean;
  discoverable?: boolean;
  tabOrder?: ('content' | 'offers' | 'reputation')[];
  expressPhone?: string | null;
  agenda?: {
    days: number[];
    startTime: string;
    endTime: string;
    slotsPerDay: number;
    pauseUntil?: string | null;
  };
}

export interface Profile {
  readonly id: string;
  readonly userId: string;
  readonly handle: string;
  readonly displayName: string;
  readonly bio: string | null;
  readonly availabilityStatus: AvailabilityStatus;
  readonly publishedAt: Date | null;
  readonly settings?: ProfileSettings;
}

export interface Offer {
  readonly id: string;
  readonly profileId: string;
  readonly kind: OfferKind;
  readonly title: string;
  readonly description: string | null;
  readonly priceMinor: bigint;
  readonly currency: string;
  readonly slaHours: number;
  readonly revisionsIncluded: number;
  readonly requiresBrief: boolean;
  /** A publicação que esta oferta desbloqueia, nas `CONTENT_UNLOCK`. */
  readonly contentItemId?: string | null;
  readonly status: OfferStatus;
}

export function isPublished(profile: Profile): boolean {
  return profile.publishedAt !== null && profile.settings?.publicVisible !== false;
}

/**
 * O perfil aceita pedidos novos?
 *
 * Só `PAUSED` fecha a porta ao nível do perfil, porque é a única decisão
 * explícita do criador. **`NO_SLOTS` não entra aqui**: é derivado das janelas de
 * uma oferta de marcação, e esgotar as vagas de uma oferta não pode impedir
 * alguém de contratar outra que nem vagas tem. Quem recusa por falta de vaga é
 * a janela, na transacção que cria o `Deal` (RN-034).
 */
export function acceptsNewDeals(profile: Profile): boolean {
  return isPublished(profile) && profile.availabilityStatus !== 'PAUSED';
}

export function offerPrice(offer: Offer): Money {
  return Money.fromMinor(offer.priceMinor, offer.currency as 'AOA');
}

/**
 * Congela os termos da oferta no momento do pedido. A partir daqui, mudar a
 * oferta não mexe em nada do que já foi contratado (RN-032, RN-041).
 */
export function snapshotOf(offer: Offer, capturedAt: Date): OfferSnapshot {
  if (offer.status !== 'ACTIVE') {
    throw new OfferNotAvailableError(offer.status);
  }

  return {
    offerId: offer.id,
    kind: offer.kind,
    title: offer.title,
    priceMinor: offer.priceMinor.toString(),
    currency: offer.currency as 'AOA',
    slaHours: offer.slaHours,
    revisionsIncluded: offer.revisionsIncluded,
    requiresBrief: offer.requiresBrief,
    capturedAt: capturedAt.toISOString(),
  };
}
