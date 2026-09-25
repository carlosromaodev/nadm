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
  responseTimeHours?: number | null;
  completedDeals?: number;
  acceptsBrands?: boolean;
  verified?: boolean;
  /** As vagas por acontecer, já filtradas pelo servidor. */
  windows?: AvailabilityWindow[];
}

export interface DirectConversation {
  id: string | null;
  viewerRole?: 'buyer' | 'creator';
  creator?: Pick<ViewerProfile, 'id' | 'handle' | 'displayName' | 'avatarUrl'>;
  buyer?: { id: string; displayName: string };
  lastMessageAt?: string;
  canSendFree: boolean;
  nextFreeAt: string | null;
  messages: Array<{
    id: string;
    senderUserId: string;
    body: string;
    clientId: string;
    readAt: string | null;
    createdAt: string;
  }>;
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

export interface FeedItem extends ContentItem {
  creator: Pick<ViewerProfile, 'id' | 'handle' | 'displayName' | 'avatarUrl'>;
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

/**
 * Junta as publicações recentes dos perfis descobertos. O servidor continua a
 * decidir que media o espectador pode ver; o cliente apenas agrega as respostas
 * públicas de cada perfil para compor o início.
 */
export function useCreatorFeed(profiles: ViewerProfile[]) {
  const { userId } = useSession();
  const handles = profiles.map((profile) => profile.handle).join(',');
  const [data, setData] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const selected = profiles.slice(0, 12);
    if (!selected.length) { setData([]); setLoading(false); return; }

    setLoading(true);
    void Promise.all(selected.map(async (creator) => {
      try {
        const response = await api<{ items: ContentItem[] }>(
          `/profiles/${encodeURIComponent(creator.handle)}/content`,
          { actorUserId: userId },
        );
        return response.items.map((item): FeedItem => ({
          ...item,
          creator: {
            id: creator.id,
            handle: creator.handle,
            displayName: creator.displayName,
            avatarUrl: creator.avatarUrl,
          },
        }));
      } catch {
        // Um perfil indisponível não deve apagar o feed dos restantes.
        return [];
      }
    })).then((groups) => {
      if (!active) return;
      setData(groups.flat().sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 18));
      setLoading(false);
    });

    return () => { active = false; };
    // `handles` representa precisamente o conjunto que alimenta o pedido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handles, userId]);

  return { data, loading };
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
