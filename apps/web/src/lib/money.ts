/**
 * Formatação de Kwanza a partir da string de cêntimos.
 *
 * Nada aqui passa por `Number`, `parseFloat` ou `toFixed` — nem sequer na
 * apresentação. Ver CLAUDE.md, regras de dinheiro.
 */

export interface MoneyValue {
  amount: string;
  currency: string;
}

/** Espaço inquebrável: em pt-AO o milhar separa-se por espaço, e o valor nunca
 *  deve partir a meio numa mudança de linha. Escrito por escape para não ficar
 *  um caractere invisível no código. */
const SEPARADOR_MILHAR = '\u00a0';

/** `"5000000"` → `"50 000,00"` */
export function formatMinor(amountMinor: string): string {
  const negativo = amountMinor.startsWith('-');
  const digitos = (negativo ? amountMinor.slice(1) : amountMinor).padStart(3, '0');

  const inteiros = digitos.slice(0, -2);
  const centimos = digitos.slice(-2);
  const agrupados = inteiros.replace(/\B(?=(\d{3})+(?!\d))/g, SEPARADOR_MILHAR);

  return `${negativo ? '−' : ''}${agrupados},${centimos}`;
}

/** O mockup omite ,00 em Kwanza inteiro; os cêntimos existentes nunca se perdem. */
export function formatMoney(value: MoneyValue): string {
  const formatted = formatMinor(value.amount);
  return `${value.currency === 'AOA' ? formatted.replace(/,00$/, '') : formatted} ${simbolo(value.currency)}`;
}

export function simbolo(currency: string): string {
  return currency === 'AOA' ? 'Kz' : currency;
}

export function isZero(value: MoneyValue): boolean {
  return /^-?0*$/.test(value.amount);
}

/** Soma líquida de um conjunto de movimentos — crédito soma, débito subtrai. Sempre em `BigInt`. */
export function somaLiquida(
  entries: { amount: MoneyValue; direction: 'DEBIT' | 'CREDIT' }[],
): string {
  const total = entries.reduce(
    (acc, entry) =>
      acc + (entry.direction === 'CREDIT' ? BigInt(entry.amount.amount) : -BigInt(entry.amount.amount)),
    0n,
  );
  return total.toString();
}


/**
 * A média de avaliações, de décimas para texto.
 *
 * Não é dinheiro, mas o princípio é o mesmo: a média chega do servidor em
 * décimas inteiras, e formatar é dividir por dez com aritmética inteira — não
 * com `toFixed` sobre um número que já perdeu precisão pelo caminho.
 */
export function formatRating(averageTenths: number): string {
  const inteiro = Math.trunc(averageTenths / 10);
  const decima = Math.abs(averageTenths % 10);

  return `${inteiro},${decima}`;
}
