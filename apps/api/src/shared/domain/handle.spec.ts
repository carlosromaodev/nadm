import { describe, expect, it } from 'vitest';
import { Handle, InvalidHandleError } from './handle';

describe('Handle', () => {
  it('normaliza para minúsculas e remove espaços à volta', () => {
    expect(Handle.create('  NelsonBeats  ').value).toBe('nelsonbeats');
  });

  it('aceita letras, dígitos e sublinhado entre 3 e 30 caracteres', () => {
    expect(Handle.create('dj_kalaf_99').value).toBe('dj_kalaf_99');
  });

  it.each(['ab', 'a'.repeat(31), 'com espaço', 'acentuação', 'com-hifen', 'com.ponto'])(
    'recusa "%s"',
    (invalido) => {
      expect(() => Handle.create(invalido)).toThrowError(InvalidHandleError);
    },
  );

  it.each(['api', 'admin', 'deals', 'wallet', 'ADMIN', 'estudio', 'entrar', 'inicio', 'descobrir', 'notificacoes', 'meu'])(
    'recusa a rota reservada "%s"',
    (reservado) => {
      expect(() => Handle.create(reservado)).toThrowError(/reserved/);
    },
  );
});
