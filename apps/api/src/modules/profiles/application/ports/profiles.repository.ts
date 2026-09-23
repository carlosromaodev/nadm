import type { TxContext } from '@/shared/application/transaction';
import type { Offer, Profile, ProfileSettings, AvailabilityStatus } from '../../domain/profile';

export interface UpdateProfileInput {
  displayName?: string;
  bio?: string | null;
  availabilityStatus?: AvailabilityStatus;
  settings?: ProfileSettings;
}

export type UpdateOfferInput = Partial<Pick<Offer,
  'title' | 'description' | 'priceMinor' | 'slaHours' | 'revisionsIncluded' | 'requiresBrief' | 'status'
>>;

export interface CreateProfileInput {
  id: string;
  userId: string;
  handle: string;
  displayName: string;
  bio: string | null;
  publishedAt: Date | null;
}

export abstract class ProfilesRepository {
  abstract findById(id: string, tx?: TxContext): Promise<Profile | null>;

  abstract findByHandle(handle: string, tx?: TxContext): Promise<Profile | null>;

  abstract findByUserId(userId: string, tx?: TxContext): Promise<Profile | null>;

  abstract create(input: CreateProfileInput, tx?: TxContext): Promise<Profile>;

  abstract listPublished(query: string, tx?: TxContext): Promise<Profile[]>;

  abstract update(id: string, input: UpdateProfileInput, tx?: TxContext): Promise<Profile>;
}

export interface CreateOfferInput {
  id: string;
  profileId: string;
  kind: Offer['kind'];
  title: string;
  description: string | null;
  priceMinor: bigint;
  currency: string;
  slaHours: number;
  revisionsIncluded: number;
  requiresBrief: boolean;
  contentItemId?: string | null;
}

export abstract class OffersRepository {
  abstract findById(id: string, tx?: TxContext): Promise<Offer | null>;

  /**
   * A oferta que desbloqueia uma publicação paga.
   *
   * Existe para publicar duas vezes a mesma publicação não criar duas ofertas:
   * quem o garante a sério é o único parcial da migração 021.
   */
  abstract findByContentItem(
    contentItemId: string,
    tx?: TxContext,
  ): Promise<Offer | null>;

  abstract listActiveByProfile(profileId: string, tx?: TxContext): Promise<Offer[]>;

  abstract create(input: CreateOfferInput, tx?: TxContext): Promise<Offer>;

  abstract listByProfile(profileId: string, tx?: TxContext): Promise<Offer[]>;

  abstract update(id: string, input: UpdateOfferInput, tx?: TxContext): Promise<Offer>;
}
