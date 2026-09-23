import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'nadm:is-public';

/**
 * Marca uma rota como aberta. A autenticação é exigida por omissão: esquecer o
 * decorador deixa a rota fechada, não aberta.
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);
