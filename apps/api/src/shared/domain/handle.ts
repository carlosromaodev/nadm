import { BusinessRuleError } from '@/core/errors/domain-error';

/** Rotas da aplicação que não podem ser tomadas por um handle de perfil. */
const RESERVED = new Set([
  'api',
  'admin',
  'login',
  'logout',
  'signup',
  'settings',
  'about',
  'help',
  'support',
  'terms',
  'privacy',
  'deals',
  'wallet',
  'search',
  'explore',
  'nadm',
  'entrar',
  'criar_perfil',
  'estudio',
  'inicio',
  'descobrir',
  'notificacoes',
  'biblioteca',
  'conversas',
  'meu',
  'membro',
  'partilhar',
  'dev',
  'health',
]);

const SHAPE = /^[a-z0-9_]{3,30}$/;

export class InvalidHandleError extends BusinessRuleError {}

export class Handle {
  private constructor(readonly value: string) {}

  static create(raw: string): Handle {
    const normalized = raw.trim().toLowerCase();

    if (!SHAPE.test(normalized)) {
      throw new InvalidHandleError(
        'Handle must be 3 to 30 characters of lowercase letters, digits or underscore',
      );
    }

    if (RESERVED.has(normalized)) {
      throw new InvalidHandleError(`Handle "${normalized}" is reserved`);
    }

    return new Handle(normalized);
  }

  static isReserved(raw: string): boolean {
    return RESERVED.has(raw.trim().toLowerCase());
  }

  toString(): string {
    return this.value;
  }
}
