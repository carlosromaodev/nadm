import { describe, expect, it } from 'vitest';
import { maskPhoneValue, redact } from './redact';

describe('redact', () => {
  describe('o que nunca sai (SDD §15.1)', () => {
    it('apaga o conteúdo de uma mensagem', () => {
      expect(redact({ dealId: 'd1', body: 'Manda-me o teu IBAN' })).toEqual({
        dealId: 'd1',
        body: '[redigido]',
      });
    });

    it('apaga o número do documento e o destino do levantamento', () => {
      expect(
        redact({ documentNumber: '003456789LA041', destination: 'AO06004000006982246210102' }),
      ).toEqual({ documentNumber: '[redigido]', destination: '[redigido]' });
    });

    it('apaga tokens, assinaturas e segredos', () => {
      expect(redact({ token: 'abc', signature: 'sha256=x', authorization: 'Bearer y' })).toEqual({
        token: '[redigido]',
        signature: '[redigido]',
        authorization: '[redigido]',
      });
    });

    it('apaga o briefing e o motivo, que são texto de pessoas', () => {
      expect(redact({ brief: 'Para a minha irmã', reason: 'Não gostei' })).toEqual({
        brief: '[redigido]',
        reason: '[redigido]',
      });
    });
  });

  describe('o telefone mascara-se, não se apaga', () => {
    it('deixa reconhecer o próprio número sem permitir marcá-lo', () => {
      expect(redact({ phone: '+244923111222' })).toEqual({ phone: '+2449****222' });
    });

    it('apanha um telefone solto no meio do texto', () => {
      expect(redact('a ligar para +244923111222 agora')).toBe(
        'a ligar para +2449****222 agora',
      );
    });

    it('um valor curto de mais desaparece por inteiro', () => {
      expect(maskPhoneValue('12345')).toBe('*****');
    });
  });

  describe('o que passa', () => {
    it('deixa passar identificadores e números, que é o que torna o registo útil', () => {
      expect(redact({ dealId: 'd1', amountMinor: 5_250_000, status: 'PAID' })).toEqual({
        dealId: 'd1',
        amountMinor: 5_250_000,
        status: 'PAID',
      });
    });

    it('converte bigint para string, que o JSON não sabe representar', () => {
      expect(redact({ amountMinor: 5_250_000n })).toEqual({ amountMinor: '5250000' });
    });

    it('desce em profundidade, incluindo dentro de listas', () => {
      expect(redact({ eventos: [{ payload: { payerPhone: '+244923111222' } }] })).toEqual({
        eventos: [{ payload: { payerPhone: '+2449****222' } }],
      });
    });

    it('pára numa estrutura funda de mais em vez de andar para sempre', () => {
      const fundo = { a: { b: { c: { d: { e: { f: { g: 'segredo' } } } } } } };

      expect(JSON.stringify(redact(fundo))).toContain('[redigido]');
    });
  });
});
