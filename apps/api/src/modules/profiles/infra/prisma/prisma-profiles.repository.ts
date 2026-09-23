import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ResourceConflictError } from '@/core/errors/domain-error';
import { clientFrom } from '@/core/database/prisma-transaction';
import { PrismaService } from '@/core/database/prisma.service';
import type { TxContext } from '@/shared/application/transaction';
import type { AvailabilityStatus, Offer, OfferStatus, Profile, ProfileSettings } from '../../domain/profile';
import type { OfferKind } from '@/modules/deals/domain/deal';
import {
  OffersRepository,
  ProfilesRepository,
  type CreateOfferInput,
  type CreateProfileInput,
  type UpdateProfileInput,
  type UpdateOfferInput,
} from '../../application/ports/profiles.repository';

interface ProfileRow {
  id: string;
  userId: string;
  handle: string;
  displayName: string;
  bio: string | null;
  availabilityStatus: string;
  publishedAt: Date | null;
  settings: unknown;
}

function toProfile(row: ProfileRow): Profile {
  return { ...row, availabilityStatus: row.availabilityStatus as AvailabilityStatus, settings: row.settings as ProfileSettings };
}

interface OfferRow {
  id: string;
  profileId: string;
  kind: string;
  title: string;
  description: string | null;
  priceMinor: bigint;
  currency: string;
  slaHours: number;
  revisionsIncluded: number;
  requiresBrief: boolean;
  status: string;
}

function toOffer(row: OfferRow): Offer {
  return {
    ...row,
    currency: row.currency.trim(),
    kind: row.kind as OfferKind,
    status: row.status as OfferStatus,
  };
}

@Injectable()
export class PrismaProfilesRepository extends ProfilesRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string, tx?: TxContext): Promise<Profile | null> {
    const row = await clientFrom(this.prisma, tx).profile.findUnique({ where: { id } });
    return row ? toProfile(row) : null;
  }

  async findByHandle(handle: string, tx?: TxContext): Promise<Profile | null> {
    const row = await clientFrom(this.prisma, tx).profile.findUnique({
      where: { handle: handle.toLowerCase() },
    });

    return row ? toProfile(row) : null;
  }

  async findByUserId(userId: string, tx?: TxContext): Promise<Profile | null> {
    const row = await clientFrom(this.prisma, tx).profile.findUnique({ where: { userId } });
    return row ? toProfile(row) : null;
  }

  async create(input: CreateProfileInput, tx?: TxContext): Promise<Profile> {
    try {
      const row = await clientFrom(this.prisma, tx).profile.create({ data: input });
      return toProfile(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ResourceConflictError('Este nome de utilizador ou perfil já está em uso.');
      }
      throw error;
    }
  }

  async listPublished(query: string, tx?: TxContext): Promise<Profile[]> {
    const client = clientFrom(this.prisma, tx);
    // IS DISTINCT FROM inclui as preferências ausentes (perfis anteriores à migração).
    const ids = await client.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM profiles WHERE published_at IS NOT NULL
      AND settings->>'publicVisible' IS DISTINCT FROM 'false'
      AND settings->>'discoverable' IS DISTINCT FROM 'false'
      AND (strpos(lower(handle || ' ' || display_name || ' ' || coalesce(bio, '')), lower(${query})) > 0)
      ORDER BY created_at DESC LIMIT 50
    `);
    const rows = await client.profile.findMany({
      where: { id: { in: ids.map(({ id }) => id) } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toProfile);
  }

  async update(id: string, input: UpdateProfileInput, tx?: TxContext): Promise<Profile> {
    const { settings, ...fields } = input;
    const row = await clientFrom(this.prisma, tx).profile.update({
      where: { id },
      data: { ...fields, ...(settings ? { settings: settings as Prisma.InputJsonValue } : {}) },
    });
    return toProfile(row);
  }
}

@Injectable()
export class PrismaOffersRepository extends OffersRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string, tx?: TxContext): Promise<Offer | null> {
    const row = await clientFrom(this.prisma, tx).offer.findUnique({ where: { id } });
    return row ? toOffer(row) : null;
  }

  async findByContentItem(contentItemId: string, tx?: TxContext) {
    const row = await clientFrom(this.prisma, tx).offer.findFirst({
      where: { contentItemId },
    });

    return row ? toOffer(row) : null;
  }

  async listActiveByProfile(profileId: string, tx?: TxContext): Promise<Offer[]> {
    const rows = await clientFrom(this.prisma, tx).offer.findMany({
      where: { profileId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map(toOffer);
  }

  async create(input: CreateOfferInput, tx?: TxContext): Promise<Offer> {
    const row = await clientFrom(this.prisma, tx).offer.create({ data: input });
    return toOffer(row);
  }

  async listByProfile(profileId: string, tx?: TxContext): Promise<Offer[]> {
    const rows = await clientFrom(this.prisma, tx).offer.findMany({
      where: { profileId, status: { not: 'ARCHIVED' } }, orderBy: { createdAt: 'asc' },
    });
    return rows.map(toOffer);
  }

  async update(id: string, input: UpdateOfferInput, tx?: TxContext): Promise<Offer> {
    const row = await clientFrom(this.prisma, tx).offer.update({ where: { id }, data: input });
    return toOffer(row);
  }
}
