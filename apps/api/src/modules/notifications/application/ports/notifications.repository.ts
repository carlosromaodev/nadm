import type { TxContext } from '@/shared/application/transaction';
import type { ChannelKind } from '../../domain/notification';

export interface PendingEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
}

export interface RecordedDelivery {
  id: string;
  outboxEventId: string;
  recipientUserId: string;
  channel: ChannelKind;
  template: string;
  idempotencyKey: string;
  provider: string;
  providerReference: string | null;
  sentAt: Date;
}

export abstract class OutboxQueue {
  /**
   * Os eventos por processar cuja hora já chegou.
   *
   * Não bloqueia linhas: o que impede dois trabalhadores de enviarem a mesma
   * coisa é a chave única de `notification_deliveries`, não um bloqueio aqui.
   * É deliberado — um bloqueio mal libertado pára a fila inteira, e uma chave
   * única não pára nada.
   */
  abstract claimBatch(now: Date, limit: number, tx?: TxContext): Promise<PendingEvent[]>;

  abstract markProcessed(id: string, processedAt: Date, tx?: TxContext): Promise<void>;

  /** Adia com recuo, e guarda o motivo. */
  abstract markFailed(
    id: string,
    error: string,
    retryAt: Date,
    tx?: TxContext,
  ): Promise<void>;
}

export abstract class DeliveriesLog {
  /**
   * Regista o envio, **se ainda não estiver registado**.
   *
   * Devolve `false` quando a chave já existia — é aí que a idempotência
   * acontece, e é por isso que se grava **antes** de enviar: entre gravar e
   * enviar pode falhar tudo, e o pior que acontece é uma notificação perdida.
   * Ao contrário, o pior que acontecia era a mesma notificação duas vezes.
   */
  abstract recordIfNew(delivery: RecordedDelivery, tx?: TxContext): Promise<boolean>;

  abstract listForUser(
    userId: string,
    limit: number,
    tx?: TxContext,
  ): Promise<RecordedDelivery[]>;
}
