import { describe, expect, it } from 'vitest';
import { editableKwanza, identityState, parseKwanza } from './creator-api';

describe('creator price editor', () => {
  it('parses amounts without floating point, including above Number precision', () => {
    expect(parseKwanza('3 500,25')).toBe('350025');
    expect(parseKwanza('9007199254740993,01')).toBe('900719925474099301');
    expect(parseKwanza('10.5')).toBe('1050');
    expect(editableKwanza('350025')).toBe('3500,25');
  });
  it('rejects empty, zero, negative, excessive decimals and exponential forms', () => {
    for (const value of ['', '0', '-1', '1,234', '1e4', 'abc']) expect(parseKwanza(value)).toBeNull();
  });
});

describe('identityState', () => {
  const base = {
    id: 'v1',
    documentType: 'BI' as const,
    documentNumber: '•••041',
    fullName: 'Nelson',
    rejectionReason: null,
    submittedAt: '2026-09-22T09:00:00.000Z',
    reviewedAt: null,
  };

  it('sem submissões, não está verificado nem à espera', () => {
    expect(identityState([])).toEqual({ verified: false, pending: false, rejected: null });
  });

  it('uma aprovada verifica, mesmo com recusas anteriores', () => {
    const estado = identityState([
      { ...base, id: 'v0', status: 'REJECTED' },
      { ...base, status: 'APPROVED' },
    ]);

    expect(estado.verified).toBe(true);
    // Verificado, a recusa antiga deixa de ser o que há para mostrar.
    expect(estado.rejected).toBeNull();
  });

  it('à espera de decisão não mostra a recusa anterior', () => {
    const estado = identityState([
      { ...base, id: 'v0', status: 'REJECTED' },
      { ...base, status: 'PENDING' },
    ]);

    expect(estado.pending).toBe(true);
    expect(estado.rejected).toBeNull();
  });

  it('só recusada: é isso que o criador precisa de ver', () => {
    const estado = identityState([{ ...base, status: 'REJECTED' }]);

    expect(estado.verified).toBe(false);
    expect(estado.rejected?.id).toBe('v1');
  });
});
