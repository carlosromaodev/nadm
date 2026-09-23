import { SetMetadata } from '@nestjs/common';
import type { Role } from '@/modules/identity/domain/user';

export const REQUIRED_ROLES = 'nadm:required-roles';

/**
 * Exige um papel para chegar à rota.
 *
 * **É a única autorização que se decide por papel.** Em todo o resto do sistema
 * a pergunta é a relação com o recurso — *este utilizador é parte deste
 * `Deal`?* — e não o cargo de quem pergunta. Papel só decide em `/admin/**`,
 * onde a existência do recurso não é segredo para quem lá chega.
 */
export const Roles = (...roles: Role[]) => SetMetadata(REQUIRED_ROLES, roles);
