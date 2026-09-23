import { describe, expect, it } from 'vitest';
import { formatMinor, formatMoney, formatRating, isZero, somaLiquida } from './money';

/** O separador de milhar é U+00A0, escrito por escape para o teste ser legível. */
const NB = '\u00a0';

describe('formatação de Kwanza', () => {
  it('põe a vírgula nos cêntimos e espaço inquebrável nos milhares', () => {
    expect(formatMinor('5000000')).toBe(`50${NB}000,00`);
  });

  it('formata valores pequenos sem perder os cêntimos', () => {
    expect(formatMinor('1')).toBe('0,01');
    expect(formatMinor('99')).toBe('0,99');
    expect(formatMinor('100')).toBe('1,00');
  });

  it('agrupa milhões', () => {
    expect(formatMinor('123456789')).toBe(`1${NB}234${NB}567,89`);
  });

  it('mantém a exactidão acima do limite de precisão de um double', () => {
    // 9007199254740993 é MAX_SAFE_INTEGER + 2: passar por `Number` arredondava
    // para ...992 e perdia o cêntimo.
    expect(formatMinor('9007199254740993')).toBe(`90${NB}071${NB}992${NB}547${NB}409,93`);
  });

  it('formata negativos com sinal de menos tipográfico', () => {
    expect(formatMinor('-5000')).toBe('−50,00');
  });

  it('acrescenta o símbolo do Kwanza', () => {
    expect(formatMoney({ amount: '4250000', currency: 'AOA' })).toBe(`42${NB}500 Kz`);
    expect(formatMoney({ amount: '4250050', currency: 'AOA' })).toBe(`42${NB}500,50 Kz`);
    expect(formatMoney({ amount: '9007199254740993', currency: 'AOA' })).toBe(`90${NB}071${NB}992${NB}547${NB}409,93 Kz`);
  });

  it('deixa outras moedas com o código, em vez de fingir que são Kwanza', () => {
    expect(formatMoney({ amount: '100', currency: 'USD' })).toBe('1,00 USD');
  });

  it('reconhece o zero em qualquer escrita', () => {
    expect(isZero({ amount: '0', currency: 'AOA' })).toBe(true);
    expect(isZero({ amount: '000', currency: 'AOA' })).toBe(true);
    expect(isZero({ amount: '1', currency: 'AOA' })).toBe(false);
  });

  it('soma crédito e subtrai débito, sem tocar em Number', () => {
    expect(
      somaLiquida([
        { amount: { amount: '5000', currency: 'AOA' }, direction: 'CREDIT' },
        { amount: { amount: '2000', currency: 'AOA' }, direction: 'DEBIT' },
      ]),
    ).toBe('3000');
  });

  it('dá negativo quando os débitos do dia pesam mais', () => {
    expect(
      somaLiquida([{ amount: { amount: '5000', currency: 'AOA' }, direction: 'DEBIT' }]),
    ).toBe('-5000');
  });

  it('mantém a exactidão acima do limite de precisão de um double também na soma', () => {
    expect(
      somaLiquida([
        { amount: { amount: '9007199254740993', currency: 'AOA' }, direction: 'CREDIT' },
        { amount: { amount: '1', currency: 'AOA' }, direction: 'CREDIT' },
      ]),
    ).toBe('9007199254740994');
  });

  it('devolve zero para uma lista vazia', () => {
    expect(somaLiquida([])).toBe('0');
  });
});

describe('formatRating', () => {
  it('mostra a décima, mesmo quando é zero', () => {
    expect(formatRating(50)).toBe('5,0');
    expect(formatRating(47)).toBe('4,7');
  });

  it('sem avaliações mostra zero', () => {
    expect(formatRating(0)).toBe('0,0');
  });

  it('não passa por vírgula flutuante', () => {
    // 4,1 em ponto flutuante é 4.0999999…; em décimas inteiras é exactamente 41.
    expect(formatRating(41)).toBe('4,1');
  });
});
