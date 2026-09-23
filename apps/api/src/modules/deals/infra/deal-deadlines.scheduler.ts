import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { RunDealDeadlinesUseCase } from '../application/use-cases/run-deal-deadlines.use-case';

export const DEADLINE_SWEEP_INTERVAL_MS = Symbol('DEADLINE_SWEEP_INTERVAL_MS');

/**
 * O que acciona T13 e T10 em produção.
 *
 * É deliberadamente burro: um intervalo, um varrimento, sem estado próprio e
 * sem memória de execuções anteriores. Toda a lógica está no caso de uso, que é
 * onde os testes lhe chegam sem esperar tempo real — este ficheiro não tem
 * teste porque não tem decisão nenhuma para testar.
 *
 * Um intervalo de `0` desliga-o, e é assim que os testes ponta a ponta correm:
 * lá, quem manda no tempo é o teste.
 */
@Injectable()
export class DealDeadlinesScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DealDeadlinesScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly runDeadlines: RunDealDeadlinesUseCase,
    @Inject(DEADLINE_SWEEP_INTERVAL_MS) private readonly intervalMs: number,
  ) {}

  onApplicationBootstrap(): void {
    if (this.intervalMs <= 0) {
      this.logger.log('Varrimento de prazos desligado (intervalo 0).');
      return;
    }

    this.timer = setInterval(() => void this.sweep(), this.intervalMs);
    // Não segura o processo vivo só por causa do temporizador.
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async sweep(): Promise<void> {
    // Um varrimento lento não se sobrepõe ao seguinte: dois em paralelo
    // tentariam expirar os mesmos pedidos.
    if (this.running) return;

    this.running = true;

    try {
      const result = await this.runDeadlines.execute();

      if (result.expired || result.autoApproved || result.failed) {
        this.logger.log(
          `Prazos: ${result.expired} expirados, ${result.autoApproved} aprovados automaticamente, ${result.failed} falhados.`,
        );
      }
    } catch (error) {
      this.logger.error('O varrimento de prazos falhou inteiro', error as Error);
    } finally {
      this.running = false;
    }
  }
}
