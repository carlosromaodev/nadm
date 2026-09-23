import { Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedUser } from '@/core/auth/auth-context';
import { CurrentUser } from '@/core/auth/current-user.decorator';
import { Roles } from '@/core/auth/roles.decorator';
import { ZodValidationPipe } from '@/core/http/zod-validation.pipe';
import { DeliveriesLog } from '../application/ports/notifications.repository';
import { DispatchOutboxUseCase } from '../application/use-cases/dispatch-outbox.use-case';

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly deliveries: DeliveriesLog) {}

  /**
   * O que foi enviado a esta pessoa.
   *
   * É dela e só dela — não há rota para ver o que foi enviado a outrem, nem
   * sequer na administração: o rasto está na auditoria, o conteúdo não.
   */
  @Get()
  async mine(
    @CurrentUser() auth: AuthenticatedUser,
    @Query(new ZodValidationPipe(listSchema)) query: z.infer<typeof listSchema>,
  ) {
    const entregues = await this.deliveries.listForUser(auth.userId, query.limit);

    return {
      data: entregues.map((entrega) => ({
        id: entrega.id,
        channel: entrega.channel,
        template: entrega.template,
        sentAt: entrega.sentAt.toISOString(),
      })),
    };
  }
}

/** Correr o despacho à mão, para a administração não ter de esperar. */
@Controller('admin/notifications')
@Roles('ADMIN')
export class AdminNotificationsController {
  constructor(private readonly dispatch: DispatchOutboxUseCase) {}

  @Post('dispatch')
  @HttpCode(200)
  async run() {
    return this.dispatch.execute();
  }
}
