import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { RunReconciliationUseCase } from '../application/use-cases/run-reconciliation.use-case';

export const RECONCILIATION_INTERVAL_MS = Symbol('RECONCILIATION_INTERVAL_MS');

/**
 * O que corre a reconciliação em produção.
 *
 * Tal como o varrimento de prazos, é deliberadamente burro: um intervalo, uma
 * passagem, sem estado próprio. Toda a decisão está no caso de uso, que é onde
 * os testes lhe chegam.
 *
 * Um intervalo de `0` desliga-o, e é assim que os testes ponta a ponta correm.
 */
@Injectable()
export class ReconciliationScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ReconciliationScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly reconciliation: RunReconciliationUseCase,
    @Inject(RECONCILIATION_INTERVAL_MS) private readonly intervalMs: number,
  ) {}

  onApplicationBootstrap(): void {
    if (this.intervalMs <= 0) {
      this.logger.log('Reconciliação desligada (intervalo 0).');
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
      const resultado = await this.reconciliation.execute();

      if (resultado.detected > 0) {
        this.logger.warn(
          `Reconciliação: ${resultado.detected} novas, ${resultado.critical} críticas, ${resultado.repeated} repetidas.`,
        );
      }
    } catch (error) {
      this.logger.error('A reconciliação falhou inteira', error as Error);
    } finally {
      this.running = false;
    }
  }
}
