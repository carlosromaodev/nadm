'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type Deal, type PublicProfile, type AvailabilityWindow } from './api';
import type { MoneyValue } from './money';
import { useSession } from './session';

export interface ViewerProfile extends PublicProfile {
  category?: string | null;
  location?: string | null;
  theme?: 'dark' | 'light';
  tabOrder?: Array<'content' | 'offers' | 'reputation'>;
  /** As vagas por acontecer, já filtradas pelo servidor. */
  windows?: AvailabilityWindow[];
}

/** Only server-authorised media URLs belong in this response. */
export interface ContentItem {
  id: string;
  kind: 'PHOTO' | 'VIDEO' | 'ALBUM' | 'PLAYLIST';
  title?: string;
  caption: string;
  visibility: 'PUBLIC' | 'PAID' | 'MEMBERS';
  price: MoneyValue | null;
  publishedAt: string;
  coverUrl: string | null;
  access: 'GRANTED' | 'LOCKED';
  /**
   * A oferta que desbloqueia esta publicação, quando é paga e ainda não foi
   * comprada. Vem do servidor: o cliente não a adivinha nem a constrói.
   */
  unlockOfferId?: string | null;
  media: Array<{ id: string; url: string; mimeType: string; title?: string }>;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Não foi possível ligar. Verifica a ligação e tenta novamente.';
}

export function useResource<T>(path: string | null, actorUserId?: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setData(null);
    setError(null);
    setStatus(null);
    if (!path) return;
    void api<T>(path, { actorUserId }).then((response) => {
      if (active) setData(response);
    }).catch((reason: unknown) => {
      if (!active) return;
      setError(errorMessage(reason));
      setStatus(reason instanceof ApiError ? reason.status : null);
    });
    return () => { active = false; };
  }, [path, actorUserId, attempt]);

  return { data, error, status, retry, loading: Boolean(path && !data && !error) };
}

export function useBuyerDeals() {
  const { userId, ready } = useSession();
  return useResource<{ data: Deal[] }>(ready && userId ? '/deals?role=buyer' : null, userId);
}

/** Personal preferences on this browser, never an authorisation or paid grant. */
export function useLocalSelection(name: string) {
  const { userId } = useSession();
  const key = `nadm:${name}:${userId ?? 'visitor'}`;
  const [values, setValues] = useState<string[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [storageError, setStorageError] = useState(false);

  useEffect(() => {
    setStorageError(false);
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
      setValues(Array.isArray(saved) ? saved.filter((item): item is string => typeof item === 'string') : []);
    } catch { setValues([]); }
    setLoadedKey(key);
  }, [key]);

  const update = useCallback((next: string[]) => {
    setValues(next);
    try { localStorage.setItem(key, JSON.stringify(next)); setStorageError(false); }
    catch { setStorageError(true); }
  }, [key]);

  function toggle(value: string) {
    update(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  }

  return { values: loadedKey === key ? values : [], toggle, update, storageError };
}

export function profileOfferHref(handle: string, offer: { id: string; kind: string }): string {
  if (offer.kind === 'BOOKING') return `/${handle}/marcar/${offer.id}`;
  if (offer.kind === 'MEMBERSHIP') return `/${handle}/membro`;
  return `/${handle}/pedir/${offer.id}`;
}
