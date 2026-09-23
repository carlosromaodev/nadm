import { Injectable } from '@nestjs/common';
import { Clock } from '@/core/clock/clock';
import { Money } from '@/shared/domain/money';
import {
  PaymentsGateway,
  type CreateIntentInput,
  type CreatedIntent,
  type ProviderEvent,
  type ProviderIntentState,
} from '../application/ports/payments.gateway';

/**
 * Prefixo reservado aos números de simulação.
 *
 * As operadoras angolanas usam 91x a 95x, por isso nenhum número real cai aqui
 * — um número de teste plausível nunca provoca um cenário por acidente.
 */
const SCENARIO_PREFIX = '+244900';

/**
 * Implementação de desenvolvimento e teste do parceiro MULTICAIXA Express,
 * enquanto DP-04 não fecha.
 *
 * Um número que comece por `+244900` escolhe o cenário pelos dois últimos
 * dígitos, para um teste provocar recusa ou expiração sem rede nem configuração:
 *
 *   …11  recusa a autorização
 *   …22  expira sem resposta
 *   qualquer outro número: captura quando a notificação chegar (o normal)
 */
@Injectable()
export class FakePaymentsGateway extends PaymentsGateway {
  readonly provider = 'fake';

  private readonly intents = new Map<string, ProviderIntentState & { amount: Money }>();
  private sequence = 0;

  constructor(private readonly clock: Clock) {
    super();
  }

  async createIntent(input: CreateIntentInput): Promise<CreatedIntent> {
    this.sequence += 1;
    const providerReference = `FAKE-${input.dealReference}-${this.sequence}`;
    const scenario = input.payerPhone.startsWith(SCENARIO_PREFIX)
      ? input.payerPhone.slice(-2)
      : 'normal';

    const status: ProviderIntentState['status'] =
      scenario === '11' ? 'FAILED' : scenario === '22' ? 'EXPIRED' : 'PENDING';

    this.intents.set(providerReference, {
      providerReference,
      status,
      amount: input.amount,
    });

    return {
      providerReference,
      status,
      expiresAt: new Date(this.clock.now().getTime() + 30 * 60 * 1000),
      instructions: `Autorize o pagamento de ${input.amount.amountMinor} cêntimos no seu telemóvel.`,
    };
  }

  async getIntent(providerReference: string): Promise<ProviderIntentState> {
    const intent = this.intents.get(providerReference);

    if (!intent) {
      return { providerReference, status: 'FAILED' };
    }

    return {
      providerReference,
      status: intent.status,
      capturedAmount: intent.status === 'CAPTURED' ? intent.amount : undefined,
    };
  }

  /** O falso aceita qualquer assinatura; o real não, e é esse o ponto de T-B. */
  verifyWebhookSignature(): boolean {
    return true;
  }

  parseWebhookEvent(rawBody: string): ProviderEvent {
    const body = JSON.parse(rawBody) as {
      eventId: string;
      reference: string;
      type: ProviderEvent['type'];
      amount?: string;
      currency?: string;
    };

    return {
      providerEventId: body.eventId,
      providerReference: body.reference,
      type: body.type,
      capturedAmount: body.amount
        ? Money.fromMinor(body.amount, (body.currency ?? 'AOA') as 'AOA')
        : undefined,
      occurredAt: this.clock.now(),
      raw: body,
    };
  }

  // ── Comandos só para desenvolvimento e teste ──────────────────────────────

  /** Simula a autorização do cliente no telemóvel e devolve a notificação. */
  captureAndBuildWebhook(providerReference: string, eventId?: string): string {
    const intent = this.intents.get(providerReference);

    if (!intent) {
      throw new Error(`Unknown provider reference: ${providerReference}`);
    }

    this.intents.set(providerReference, { ...intent, status: 'CAPTURED' });

    return JSON.stringify({
      eventId: eventId ?? `evt-${providerReference}`,
      reference: providerReference,
      type: 'payment.captured',
      amount: intent.amount.amountMinor.toString(),
      currency: intent.amount.currency,
    });
  }
}
