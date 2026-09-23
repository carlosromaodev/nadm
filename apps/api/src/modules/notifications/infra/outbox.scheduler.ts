import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { DispatchOutboxUseCase } from '../application/use-cases/dispatch-outbox.use-case';

export const OUTBOX_INTERVAL_MS = Symbol('OUTBOX_INTERVAL_MS');

/**
 * O que consome a fila em produção.
 *
 * O terceiro agendador do sistema, com a mesma forma dos outros dois: um
 * intervalo, uma passagem, sem estado próprio, e `0` para o desligar. O
 * intervalo é curto porque uma notificação atrasada meia hora já não serve para
 * nada.
 */
@Injectable()
export class OutboxScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly dispatch: DispatchOutboxUseCase,
    @Inject(OUTBOX_INTERVAL_MS) private readonly intervalMs: number,
  ) {}

  onApplicationBootstrap(): void {
    if (this.intervalMs <= 0) {
      this.logger.log('Despacho de notificações desligado (intervalo 0).');
      return;
    }

    this.timer = setInterval(() => void this.run(), this.intervalMs);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async run(): Promise<void> {
    if (this.running) return;

    this.running = true;

    try {
      const resultado = await this.dispatch.execute();

      if (resultado.failed > 0) {
        this.logger.warn(
          `Despacho: ${resultado.sent} enviadas, ${resultado.deferred} adiadas, ${resultado.failed} falhadas.`,
        );
      }
    } catch (error) {
      this.logger.error('O despacho de notificações falhou inteiro', error as Error);
    } finally {
      this.running = false;
    }
  }
}
