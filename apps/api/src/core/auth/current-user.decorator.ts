import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from './auth-context';

/**
 * O identificador do utilizador vem daqui e só daqui. Nenhuma rota o aceita do
 * corpo do pedido para decidir de quem são os dados.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<Request>();

    if (!request.auth) {
      throw new UnauthorizedException();
    }

    return request.auth;
  },
);


/**
 * O utilizador, quando há um.
 *
 * Para as rotas **públicas que mostram mais a quem tem sessão** — o catálogo de
 * um perfil mostra o que é público a toda a gente, e acrescenta o que esta
 * pessoa comprou. `@CurrentUser()` não serve aí porque recusa quem não tem
 * sessão, e o ponto é precisamente deixá-lo entrar.
 *
 * Continua a valer a regra: o identificador vem daqui e nunca do corpo.
 */
export const OptionalUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | undefined =>
    context.switchToHttp().getRequest<Request>().auth,
);
