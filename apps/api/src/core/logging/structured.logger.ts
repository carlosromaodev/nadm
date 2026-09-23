import { ConsoleLogger, type LogLevel } from '@nestjs/common';
import { redact } from './redact';

/**
 * Uma linha de registo por evento, em JSON, já limpa.
 *
 * O mascaramento acontece **aqui**, no sítio por onde tudo passa, e não em cada
 * chamada. Confiar em que cada uma se lembre de mascarar é garantir que uma se
 * esquece — e basta uma para um número de telefone ficar num ficheiro.
 */
export class StructuredLogger extends ConsoleLogger {
  protected printMessages(
    messages: unknown[],
    context?: string,
    logLevel: LogLevel = 'log',
  ): void {
    for (const message of messages) {
      const linha = {
        level: logLevel,
        time: new Date().toISOString(),
        context: context ?? this.context ?? null,
        ...this.corpo(message),
      };

      process.stdout.write(`${JSON.stringify(linha)}\n`);
    }
  }

  private corpo(message: unknown): Record<string, unknown> {
    if (typeof message === 'string') {
      return { message: redact(message) as string };
    }

    if (message instanceof Error) {
      return { message: message.message, stack: message.stack };
    }

    const limpo = redact(message);

    return limpo && typeof limpo === 'object'
      ? (limpo as Record<string, unknown>)
      : { message: String(limpo) };
  }
}
