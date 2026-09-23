import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { UsersRepository } from '@/modules/identity/application/ports/identity.repository';
import { IS_PUBLIC } from './public.decorator';

/**
 * ADAPTADOR PROVISÓRIO — não é autenticação.
 *
 * DP-01 está em aberto: não há mecanismo de sessão decidido nem pacote
 * instalado. Até T-A fechar, F1 identifica o utilizador pelo cabeçalho
 * `X-Dev-User`, o que é suficiente para percorrer o ciclo em desenvolvimento e
 * nos testes, e é inaceitável em qualquer outro sítio.
 *
 * A trava está no construtor: com `NODE_ENV=production` o processo não arranca.
 * Ver docs/plano.md, dívida declarada de F1.
 */
@Injectable()
export class DevAuthGuard implements CanActivate {
  private readonly logger = new Logger(DevAuthGuard.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly reflector: Reflector,
  ) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'DevAuthGuard nunca pode correr em produção. Resolva DP-01 e implemente T-A ' +
          'antes de expor a API.',
      );
    }

    this.logger.warn(
      'Autenticação provisória activa: o utilizador vem do cabeçalho X-Dev-User (DP-01).',
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<Request>();
    const userId = request.header('x-dev-user');

    // Numa rota pública o utilizador continua a ser resolvido quando vem — é o
    // que permite ao catálogo de um perfil mostrar o que é público a toda a
    // gente e acrescentar o que **esta** pessoa comprou. O que muda é que a
    // ausência deixa de ser erro.
    if (!userId) {
      if (isPublic) return true;

      throw new UnauthorizedException('Missing X-Dev-User header');
    }

    const user = await this.users.findById(userId);

    if (!user || user.status !== 'ACTIVE') {
      if (isPublic) return true;

      throw new UnauthorizedException('Unknown or inactive user');
    }

    request.auth = { userId: user.id, roles: user.roles };

    return true;
  }
}
