import { describe, expect, it } from 'vitest';
import { estimateMimo } from './mimo';
describe('estimativa de mimo, sem executar pagamentos', () => {
  it('apresenta os quatro valores do escalão de 5 000 Kz sem arredondamento flutuante', () => {
    expect(estimateMimo('500000')).toEqual({ price: { amount: '500000', currency: 'AOA' }, buyerFee: { amount: '25000', currency: 'AOA' }, total: { amount: '525000', currency: 'AOA' }, creatorNet: { amount: '475000', currency: 'AOA' } });
  });
  it('calcula os extremos permitidos', () => {
    expect(estimateMimo('100000').total.amount).toBe('105000');
    expect(estimateMimo('5000000').creatorNet.amount).toBe('4750000');
  });
  it('recusa valores fora dos escalões ou em formato decimal', () => {
    for (const value of ['0', '-500000', '5000.00', '100001', 'NaN']) expect(() => estimateMimo(value)).toThrow();
  });
});
