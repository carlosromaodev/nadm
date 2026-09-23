import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Role } from '@/modules/identity/domain/user';
import { REQUIRED_ROLES } from './roles.decorator';

/**
 * Guarda de papel, para `/admin/**` e mais nada.
 *
 * Devolve **403 e não 404**, ao contrário dos guardas de relação: quem chega a
 * uma rota de administração e não tem o papel não fica a saber nada que já não
 * soubesse. O 404 existe para não confirmar a existência de recursos alheios, e
 * aqui não há recurso alheio nenhum a esconder.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(REQUIRED_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const roles = request.auth?.roles ?? [];

    if (!required.some((role) => roles.includes(role))) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'ForbiddenAction',
        message: 'Esta operação é da administração.',
      });
    }

    return true;
  }
}
