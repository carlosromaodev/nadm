import type { ChannelKind, Recipient } from '../../domain/notification';

export interface SendInput {
  kind: ChannelKind;
  to: Recipient;
  template: string;
  data: Record<string, string>;
  idempotencyKey: string;
}

export interface DeliveryReceipt {
  /** Referência do fornecedor, quando existe. */
  providerReference: string | null;
  deliveredAt: Date;
}

/**
 * Por onde sai uma notificação.
 *
 * Como nos pagamentos, tem implementação real e falsa, escolhidas por variável
 * de ambiente. **Os fornecedores concretos são DP-03 e não estão decididos**,
 * por isso só existe a falsa — que é quanto basta para provar que a notificação
 * certa é planeada, agrupada e enviada uma só vez.
 */
export abstract class NotificationChannel {
  abstract readonly provider: string;

  /** Os canais que esta implementação sabe servir. */
  abstract supports(kind: ChannelKind): boolean;

  abstract send(input: SendInput): Promise<DeliveryReceipt>;
}
