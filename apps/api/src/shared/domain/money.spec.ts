import { describe, expect, it } from 'vitest';
import { CurrencyMismatchError, InvalidMoneyAmountError, Money } from './money';

describe('Money', () => {
  describe('construção', () => {
    it('aceita cêntimos como bigint, inteiro e string', () => {
      expect(Money.fromMinor(5_000_000n).amountMinor).toBe(5_000_000n);
      expect(Money.fromMinor(5_000_000).amountMinor).toBe(5_000_000n);
      expect(Money.fromMinor('5000000').amountMinor).toBe(5_000_000n);
    });

    it('recusa um valor com casas decimais em vez de o arredondar', () => {
      expect(() => Money.fromMinor(1500.5)).toThrowError(InvalidMoneyAmountError);
    });

    it('recusa um valor acima do inteiro seguro de JavaScript', () => {
      expect(() => Money.fromMinor(Number.MAX_SAFE_INTEGER + 1)).toThrowError(
        InvalidMoneyAmountError,
      );
    });

    it('recusa uma string que não é um inteiro', () => {
      expect(() => Money.fromMinor('1500,50')).toThrowError(InvalidMoneyAmountError);
      expect(() => Money.fromMinor('1500.50')).toThrowError(InvalidMoneyAmountError);
    });

    it('guarda valores acima do limite de precisão de um double sem perder exactidão', () => {
      const huge = Money.fromMinor('9007199254740993');

      expect(huge.amountMinor.toString()).toBe('9007199254740993');
      expect(huge.toJSON().amount).toBe('9007199254740993');
    });
  });

  describe('aritmética', () => {
    it('soma e subtrai na mesma moeda', () => {
      const a = Money.fromMinor(1_500_000n);
      const b = Money.fromMinor(500_000n);

      expect(a.add(b).amountMinor).toBe(2_000_000n);
      expect(a.subtract(b).amountMinor).toBe(1_000_000n);
    });

    it('recusa operar entre moedas diferentes', () => {
      const kwanza = Money.fromMinor(1000n, 'AOA');
      const outra = Money.fromMinor(1000n, 'USD' as 'AOA');

      expect(() => kwanza.add(outra)).toThrowError(CurrencyMismatchError);
    });

    it('é imutável — somar devolve um valor novo', () => {
      const original = Money.fromMinor(1000n);
      const resultado = original.add(Money.fromMinor(500n));

      expect(original.amountMinor).toBe(1000n);
      expect(resultado).not.toBe(original);
    });
  });

  describe('repartição (RN-110)', () => {
    it('reparte sem perder um cêntimo quando a divisão é exacta', () => {
      const [net, fee] = Money.fromMinor(5_000_000n).allocate([8500, 1500]);

      expect(net.amountMinor).toBe(4_250_000n);
      expect(fee.amountMinor).toBe(750_000n);
      expect(net.add(fee).amountMinor).toBe(5_000_000n);
    });

    it('entrega o resto à primeira parcela quando a divisão não é exacta', () => {
      // 1 cêntimo a 85/15 não divide: a parcela do criador fica com o resto.
      const [net, fee] = Money.fromMinor(1n).allocate([8500, 1500]);

      expect(net.amountMinor).toBe(1n);
      expect(fee.amountMinor).toBe(0n);
      expect(net.add(fee).amountMinor).toBe(1n);
    });

    it('a soma das parcelas é sempre o valor original, para qualquer valor', () => {
      const pesos = [8500, 1500];

      for (let cents = 0n; cents < 400n; cents += 1n) {
        const total = Money.fromMinor(cents);
        const soma = total
          .allocate(pesos)
          .reduce((acc, parte) => acc.add(parte), Money.zero());

        expect(soma.amountMinor).toBe(cents);
      }
    });

    it('reparte por três partes sem perder cêntimos', () => {
      const partes = Money.fromMinor(100n).allocate([1, 1, 1]);

      expect(partes.map((parte) => parte.amountMinor)).toEqual([34n, 33n, 33n]);
    });

    it('recusa repartir um valor negativo', () => {
      expect(() => Money.fromMinor(-100n).allocate([1, 1])).toThrowError(InvalidMoneyAmountError);
    });

    it('recusa pesos que somam zero', () => {
      expect(() => Money.fromMinor(100n).allocate([0, 0])).toThrowError(InvalidMoneyAmountError);
    });

    it('recusa pesos não inteiros', () => {
      expect(() => Money.fromMinor(100n).allocate([1.5, 1])).toThrowError(InvalidMoneyAmountError);
    });
  });

  describe('transporte (RN-111)', () => {
    it('serializa o valor como string de inteiro, nunca como número', () => {
      const corpo = JSON.parse(JSON.stringify({ price: Money.fromMinor(5_000_000n) }));

      expect(corpo.price).toEqual({ amount: '5000000', currency: 'AOA' });
      expect(typeof corpo.price.amount).toBe('string');
    });
  });
});

describe('Money.abs', () => {
  it('deixa um valor positivo como está', () => {
    expect(Money.fromMinor(1_500n).abs().amountMinor).toBe(1_500n);
  });

  it('tira o sinal a um valor negativo', () => {
    expect(Money.fromMinor(-1_500n).abs().amountMinor).toBe(1_500n);
  });

  it('zero continua zero', () => {
    expect(Money.zero().abs().isZero).toBe(true);
  });

  it('mantém a moeda', () => {
    expect(Money.fromMinor(-1n, 'AOA').abs().currency).toBe('AOA');
  });
});
