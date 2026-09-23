export type Role = 'FAN' | 'CREATOR' | 'BRAND_MEMBER' | 'BRAND_OWNER' | 'ADMIN' | 'SUPPORT';

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';

export type VerificationLevel = 'NONE' | 'PHONE' | 'IDENTITY';

export interface User {
  readonly id: string;
  readonly phone: string;
  readonly email: string | null;
  readonly displayName: string;
  readonly roles: Role[];
  readonly status: UserStatus;
  readonly verificationLevel: VerificationLevel;
  readonly suspendedAt?: Date | null;
  readonly suspensionReason?: string | null;
}

export type AccountType = 'INDIVIDUAL' | 'BRAND';

export interface Account {
  readonly id: string;
  readonly type: AccountType;
  readonly legalName: string | null;
  readonly taxId: string | null;
  readonly ownerUserId: string;
}

/** Telefone angolano em E.164. A verificação a sério chega com DP-01. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '');

  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('244')) return `+${digits}`;

  return `+244${digits.replace(/^0+/, '')}`;
}


/**
 * Telefone mascarado para registo e listagens: `+2449****321`.
 *
 * Um número de telefone completo nunca entra no registo estruturado (SDD
 * §15.1). O que fica é o suficiente para alguém reconhecer o seu próprio
 * número e insuficiente para marcar o de outra pessoa.
 */
export function maskPhone(phone: string): string {
  const limpo = phone.trim();

  if (limpo.length <= 8) return '*'.repeat(limpo.length);

  return `${limpo.slice(0, 5)}****${limpo.slice(-3)}`;
}
