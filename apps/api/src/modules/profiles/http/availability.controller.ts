import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedUser } from '@/core/auth/auth-context';
import { CurrentUser } from '@/core/auth/current-user.decorator';
import { Public } from '@/core/auth/public.decorator';
import { ZodValidationPipe } from '@/core/http/zod-validation.pipe';
import {
  CreateAvailabilityWindowUseCase,
  DeleteAvailabilityWindowUseCase,
  ListMyWindowsUseCase,
  ListOfferWindowsUseCase,
} from '../application/use-cases/availability.use-case';
import { freeSlots, type AvailabilityWindow } from '../domain/availability';

const createSchema = z
  .object({
    offerId: z.string().uuid(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    slotsTotal: z.coerce.number().int().min(1).max(500),
  })
  .strict();

function present(window: AvailabilityWindow) {
  return {
    id: window.id,
    offerId: window.offerId,
    startsAt: window.startsAt.toISOString(),
    endsAt: window.endsAt.toISOString(),
    slotsTotal: window.slotsTotal,
    slotsTaken: window.slotsTaken,
    slotsFree: freeSlots(window),
    timezone: window.timezone,
  };
}

@Controller()
export class AvailabilityController {
  constructor(
    private readonly create: CreateAvailabilityWindowUseCase,
    private readonly listForOffer: ListOfferWindowsUseCase,
    private readonly listMine: ListMyWindowsUseCase,
    private readonly remove: DeleteAvailabilityWindowUseCase,
  ) {}

  @Post('availability')
  async open(
    @CurrentUser() auth: AuthenticatedUser,
    @Body(new ZodValidationPipe(createSchema)) body: z.infer<typeof createSchema>,
  ) {
    return present(await this.create.execute({ actorUserId: auth.userId, ...body }));
  }

  /** A agenda do próprio criador. */
  @Get('availability')
  async mine(@CurrentUser() auth: AuthenticatedUser) {
    return { data: (await this.listMine.execute(auth.userId)).map(present) };
  }

  /**
   * As vagas de uma oferta. **Pública**: é o que o comprador vê antes de
   * contratar, e não diz nada sobre quem as tomou.
   */
  @Public()
  @Get('offers/:offerId/availability')
  async forOffer(@Param('offerId', ParseUUIDPipe) offerId: string) {
    return { data: (await this.listForOffer.execute(offerId)).map(present) };
  }

  @Delete('availability/:id')
  @HttpCode(204)
  async close(
    @CurrentUser() auth: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.remove.execute({ actorUserId: auth.userId, windowId: id });
  }
}
