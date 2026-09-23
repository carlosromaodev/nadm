'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  api,
  type AvailabilityWindow,
  type Deal,
  type IdentityVerification,
  type Offer,
  type Payout,
  type PublicProfile,
  type Wallet,
} from './api';
import { useSession } from './session';

export interface CreatorSettings {
  theme?: 'dark' | 'light';
  category?: string;
  location?: string;
  whoCanMessage?: 'everyone' | 'members' | 'customers';
  showActivity?: boolean;
  showReviews?: boolean;
  showEarnings?: boolean;
  notifications?: boolean;
  publicVisible?: boolean;
  discoverable?: boolean;
  tabOrder?: ('content' | 'offers' | 'reputation')[];
  expressPhone?: string | null;
  agenda?: { days: number[]; startTime: string; endTime: string; slotsPerDay: number; pauseUntil?: string | null };
}
export interface CreatorOffer extends Offer { status?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED' }
export interface CreatorProfile extends PublicProfile { settings?: CreatorSettings; offers: CreatorOffer[] }
export interface CreatorData {
  profile: CreatorProfile;
  deals: Deal[];
  wallet: Wallet;
  payouts: Payout[];
  identity: IdentityVerification[];
  /** As vagas por acontecer, de todas as ofertas de marcação do criador. */
  windows: AvailabilityWindow[];
}

/**
 * O estado da identidade do criador, como a carteira precisa de o ler.
 *
 * Quem decide se pode levantar é o servidor (RN-051); isto serve só para o
 * ecrã não oferecer um botão que vai falhar.
 */
export function identityState(verifications: IdentityVerification[]): {
  verified: boolean;
  pending: boolean;
  rejected: IdentityVerification | null;
} {
  const verified = verifications.some((v) => v.status === 'APPROVED');
  const pending = verifications.some((v) => v.status === 'PENDING');
  const rejected = verifications.find((v) => v.status === 'REJECTED') ?? null;

  return { verified, pending, rejected: verified || pending ? null : rejected };
}

/** A single error state replaces infinite spinners when any required API fails. */
export function useCreatorData() {
  const { userId, ready } = useSession();
  const [data, setData] = useState<CreatorData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  useEffect(() => {
    if (!ready || !userId) { setData(null); return; }
    let active = true;
    setError(null);
    Promise.all([
      api<CreatorProfile>('/profiles/me', { actorUserId: userId }),
      api<{ data: Deal[] }>('/deals?role=creator&limit=100', { actorUserId: userId }),
      api<Wallet>('/wallet', { actorUserId: userId }),
      api<{ data: Payout[] }>('/payouts', { actorUserId: userId }),
      api<{ data: IdentityVerification[] }>('/identity-verifications', { actorUserId: userId }),
      api<{ data: AvailabilityWindow[] }>('/availability', { actorUserId: userId }),
    ]).then(([profile, deals, wallet, payouts, identity, windows]) => {
      if (active) {
        setData({
          profile,
          deals: deals.data,
          wallet,
          payouts: payouts.data,
          identity: identity.data,
          windows: windows.data,
        });
      }
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível abrir o estúdio.');
    });
    return () => { active = false; };
  }, [ready, userId, version]);
  return { data, error, ready, userId, reload };
}

export const creatorMoney = (amount: bigint | string) => ({ amount: amount.toString(), currency: 'AOA' });
export const hasCreatorAction = (deal: Deal) =>
  (deal.status === 'PROPOSED' && deal.escrowStatus === 'HELD') ||
  deal.status === 'ACCEPTED' || deal.status === 'IN_PROGRESS';
export function creatorDeadline(deal: Deal): string {
  const deadline = deal.dueAt ?? deal.expiresAt;
  if (!hasCreatorAction(deal) || !deadline) return '';
  return new Date(deadline).toLocaleString('pt-AO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
export function parseKwanza(value: string): string | null {
  const clean = value.replace(/[\s\u00a0]/g, '');
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(clean)) return null;
  const [whole, decimal = ''] = clean.replace(',', '.').split('.');
  const amount = BigInt(whole) * 100n + BigInt(decimal.padEnd(2, '0'));
  return amount > 0n ? amount.toString() : null;
}
export function editableKwanza(amount: string): string {
  const value = BigInt(amount);
  return `${value / 100n},${(value % 100n).toString().padStart(2, '0')}`;
}
