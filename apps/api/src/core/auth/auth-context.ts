import type { Role } from '@/modules/identity/domain/user';

/** Quem está a fazer o pedido. Resolvido no servidor, nunca vindo do corpo. */
export interface AuthenticatedUser {
  userId: string;
  roles: Role[];
}

declare module 'express' {
  interface Request {
    auth?: AuthenticatedUser;
  }
}
