/**
 * Contexto opaco de uma transacção. Quem chama não sabe o que tem dentro; os
 * repositórios de infra sabem, e é só lá que é destapado.
 */
export interface TxContext {
  readonly [key: string]: unknown;
}

/**
 * Mudança de estado, lançamento no razão e escrita no outbox acontecem dentro
 * do mesmo `run`. Ou tudo, ou nada — ver CLAUDE.md, regras de dinheiro.
 */
export abstract class TransactionRunner {
  abstract run<T>(work: (tx: TxContext) => Promise<T>): Promise<T>;
}
