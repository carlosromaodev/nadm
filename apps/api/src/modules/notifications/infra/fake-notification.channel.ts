import { Injectable } from '@nestjs/common';
import { Clock } from '@/core/clock/clock';
import { NotificationChannel, type DeliveryReceipt, type SendInput } from '../application/ports/notification-channel';
import type { ChannelKind } from '../domain/notification';

export interface SentNotification extends SendInput {
  sentAt: Date;
}

/**
 * O canal de desenvolvimento e teste.
 *
 * Grava numa lista inspeccionável em vez de enviar, como manda o SDD §14.1 — e
 * como o `FakePaymentsGateway` faz para os pagamentos. **Nenhum teste toca em
 * rede**, e a implementação real entra por variável de ambiente quando DP-03
 * fechar, sem que nada acima disto mude.
 */
@Injectable()
export class FakeNotificationChannel extends NotificationChannel {
  readonly provider = 'fake';

  /** Tudo o que foi "enviado", por ordem. Os testes lêem daqui. */
  readonly sent: SentNotification[] = [];

  /** Faz o envio seguinte falhar, para exercitar a retentativa. */
  private falharProximo: string | null = null;

  constructor(private readonly clock: Clock) {
    super();
  }

  supports(_kind: ChannelKind): boolean {
    return true;
  }

  async send(input: SendInput): Promise<DeliveryReceipt> {
    if (this.falharProximo) {
      const motivo = this.falharProximo;
      this.falharProximo = null;
      throw new Error(motivo);
    }

    const sentAt = this.clock.now();

    this.sent.push({ ...input, sentAt });

    return { providerReference: `fake:${input.idempotencyKey}`, deliveredAt: sentAt };
  }

  failNextSend(reason = 'falha simulada do fornecedor'): void {
    this.falharProximo = reason;
  }

  clear(): void {
    this.sent.length = 0;
    this.falharProximo = null;
  }
}
