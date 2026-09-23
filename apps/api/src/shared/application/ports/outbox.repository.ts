import type { TxContext } from '../transaction';

export interface OutboxEventInput {
  type: string;
  payload: Record<string, unknown>;
  availableAt: Date;
}

/**
 * Eventos escritos na mesma transacção que muda o estado. Evita o caso em que a
 * transacção reverte mas a notificação já saiu. Consumido em F9.
 */
export abstract class OutboxRepository {
  abstract enqueue(event: OutboxEventInput, tx?: TxContext): Promise<void>;
}
