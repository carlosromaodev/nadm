import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { clientFrom } from '@/core/database/prisma-transaction';
import { PrismaService } from '@/core/database/prisma.service';
import type { TxContext } from '@/shared/application/transaction';
import { AvailabilityRepository } from '../../application/ports/availability.repository';
import { OverlappingWindowError, type AvailabilityWindow } from '../../domain/availability';

type Row = Prisma.AvailabilityWindowGetPayload<object>;

function toDomain(row: Row): AvailabilityWindow {
  return {
    id: row.id,
    profileId: row.profileId,
    offerId: row.offerId,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    slotsTotal: row.slotsTotal,
    slotsTaken: row.slotsTaken,
    timezone: row.timezone,
  };
}

@Injectable()
export class PrismaAvailabilityRepository extends AvailabilityRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string, tx?: TxContext): Promise<AvailabilityWindow | null> {
    const row = await clientFrom(this.prisma, tx).availabilityWindow.findUnique({
      where: { id },
    });

    return row ? toDomain(row) : null;
  }

  async listUpcomingByOffer(
    offerId: string,
    now: Date,
    tx?: TxContext,
  ): Promise<AvailabilityWindow[]> {
    const rows = await clientFrom(this.prisma, tx).availabilityWindow.findMany({
      where: { offerId, endsAt: { gt: now } },
      orderBy: { startsAt: 'asc' },
    });

    return rows.map(toDomain);
  }

  async listUpcomingByProfile(
    profileId: string,
    now: Date,
    tx?: TxContext,
  ): Promise<AvailabilityWindow[]> {
    const rows = await clientFrom(this.prisma, tx).availabilityWindow.findMany({
      where: { profileId, endsAt: { gt: now } },
      orderBy: { startsAt: 'asc' },
    });

    return rows.map(toDomain);
  }

  async hasBookableSlots(
    profileId: string,
    now: Date,
    tx?: TxContext,
  ): Promise<boolean | null> {
    const client = clientFrom(this.prisma, tx);

    const comMarcacao = await client.offer.count({
      where: { profileId, kind: 'BOOKING', status: 'ACTIVE' },
    });

    if (comMarcacao === 0) return null;

    const livres = await client.availabilityWindow.count({
      where: {
        profileId,
        endsAt: { gt: now },
        slotsTaken: { lt: client.availabilityWindow.fields.slotsTotal },
      },
    });

    return livres > 0;
  }

  async create(window: AvailabilityWindow, tx?: TxContext): Promise<AvailabilityWindow> {
    try {
      const row = await clientFrom(this.prisma, tx).availabilityWindow.create({
        data: {
          id: window.id,
          profileId: window.profileId,
          offerId: window.offerId,
          startsAt: window.startsAt,
          endsAt: window.endsAt,
          slotsTotal: window.slotsTotal,
          slotsTaken: window.slotsTaken,
          timezone: window.timezone,
        },
      });

      return toDomain(row);
    } catch (error) {
      // `availability_windows_no_overlap` é uma restrição de exclusão, e o
      // Prisma não lhe dá código próprio: chega como erro cru do Postgres.
      if (
        error instanceof Prisma.PrismaClientUnknownRequestError &&
        error.message.includes('availability_windows_no_overlap')
      ) {
        throw new OverlappingWindowError();
      }

      throw error;
    }
  }

  async takeSlot(id: string, tx?: TxContext): Promise<boolean> {
    // Um `UPDATE` condicionado, não um `SELECT` seguido de escrita: é o
    // Postgres a decidir quem fica com a última vaga (RN-034).
    const afectadas = await clientFrom(this.prisma, tx).$executeRaw`
      UPDATE availability_windows
         SET slots_taken = slots_taken + 1, updated_at = NOW()
       WHERE id = ${id}::uuid
         AND slots_taken < slots_total
    `;

    return afectadas === 1;
  }

  async releaseSlot(id: string, tx?: TxContext): Promise<void> {
    await clientFrom(this.prisma, tx).$executeRaw`
      UPDATE availability_windows
         SET slots_taken = slots_taken - 1, updated_at = NOW()
       WHERE id = ${id}::uuid
         AND slots_taken > 0
    `;
  }

  async delete(id: string, tx?: TxContext): Promise<void> {
    await clientFrom(this.prisma, tx).availabilityWindow.delete({ where: { id } });
  }
}
