import { BusinessRuleError } from '@/core/errors/domain-error';

export type Currency = 'AOA';

export class CurrencyMismatchError extends BusinessRuleError {
  constructor(left: Currency, right: Currency) {
    super(`Cannot operate on ${left} and ${right} amounts`);
  }
}

export class InvalidMoneyAmountError extends BusinessRuleError {}

/**
 * Valor monetário em inteiros da menor unidade, com moeda explícita.
 *
 * Nunca vírgula flutuante — nem aqui, nem em quem chama isto. É por isso que
 * `fromMinor` recusa um `number` não inteiro em vez de o arredondar em silêncio.
 */
export class Money {
  private constructor(
    readonly amountMinor: bigint,
    readonly currency: Currency,
  ) {}

  static fromMinor(amount: bigint | number | string, currency: Currency = 'AOA'): Money {
    return new Money(toBigInt(amount), currency);
  }

  static zero(currency: Currency = 'AOA'): Money {
    return new Money(0n, currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amountMinor + other.amountMinor, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amountMinor - other.amountMinor, this.currency);
  }

  equals(other: Money): boolean {
    return this.amountMinor === other.amountMinor && this.currency === other.currency;
  }

  greaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amountMinor > other.amountMinor;
  }

  lessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amountMinor < other.amountMinor;
  }

  get isZero(): boolean {
    return this.amountMinor === 0n;
  }

  get isPositive(): boolean {
    return this.amountMinor > 0n;
  }

  get isNegative(): boolean {
    return this.amountMinor < 0n;
  }

  /**
   * A grandeza, sem sinal.
   *
   * Existe porque o razão só aceita valores positivos — o sinal vive na
   * `direction` (RN-102). Uma diferença calculada por subtracção tem de perder
   * o sinal antes de virar entrada.
   */
  abs(): Money {
    return this.isNegative ? new Money(-this.amountMinor, this.currency) : this;
  }

  /**
   * Reparte o valor pelos pesos dados sem perder um cêntimo: a soma das parcelas
   * é exactamente o valor original e o resto da divisão vai para a primeira
   * parcela (RN-110).
   */
  allocate(weights: readonly number[]): Money[] {
    if (weights.length === 0) {
      throw new InvalidMoneyAmountError('Allocation needs at least one weight');
    }

    if (weights.some((weight) => !Number.isInteger(weight) || weight < 0)) {
      throw new InvalidMoneyAmountError('Allocation weights must be non-negative integers');
    }

    if (this.isNegative) {
      throw new InvalidMoneyAmountError('Cannot allocate a negative amount');
    }

    const total = weights.reduce((sum, weight) => sum + weight, 0);

    if (total === 0) {
      throw new InvalidMoneyAmountError('Allocation weights must not sum to zero');
    }

    let remainder = this.amountMinor;
    const parts = weights.map((weight) => {
      const part = (this.amountMinor * BigInt(weight)) / BigInt(total);
      remainder -= part;
      return part;
    });

    parts[0] += remainder;

    return parts.map((part) => new Money(part, this.currency));
  }

  /** No transporte, dinheiro vai como string de inteiro. Número JSON é IEEE-754 (RN-111). */
  toJSON(): { amount: string; currency: Currency } {
    return { amount: this.amountMinor.toString(), currency: this.currency };
  }

  toString(): string {
    return `${this.amountMinor.toString()} ${this.currency}`;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }
}

function toBigInt(amount: bigint | number | string): bigint {
  if (typeof amount === 'bigint') return amount;

  if (typeof amount === 'number') {
    if (!Number.isInteger(amount)) {
      throw new InvalidMoneyAmountError(
        `Monetary amounts are integers in the minor unit; got ${amount}`,
      );
    }

    if (!Number.isSafeInteger(amount)) {
      throw new InvalidMoneyAmountError(`Amount ${amount} exceeds the safe integer range`);
    }

    return BigInt(amount);
  }

  if (!/^-?\d+$/.test(amount)) {
    throw new InvalidMoneyAmountError(`"${amount}" is not an integer amount`);
  }

  return BigInt(amount);
}
