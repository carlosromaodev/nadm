'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError, type PublicProfile } from './api';

/**
 * SESSÃO PROVISÓRIA — não é autenticação.
 *
 * Espelha o `DevAuthGuard` do backend: guarda um identificador e envia-o no
 * cabeçalho `X-Dev-User`. Desaparece com T-A, quando DP-01 fechar.
 *
 * Nenhum ecrã decide permissões a partir daqui. Quem decide é o servidor, a
 * cada pedido — isto serve só para saber em nome de quem perguntar.
 */
const CHAVE = 'nadm.dev-user';

/** A fresh document clears in-memory data and avoids the private-route guard
 * racing the logout redirect and restoring the previous page as `next`. */
export function endSession() {
  try { window.localStorage.removeItem(CHAVE); } catch { /* Reload also clears an in-memory-only session. */ }
  window.location.replace('/entrar');
}

interface SessionValue {
  userId: string | null;
  setUserId: (id: string | null) => void;
  ready: boolean;
  profile: PublicProfile | null;
  profileReady: boolean;
  profileError: string | null;
  refreshProfile: () => void;
  mode: 'buyer' | 'creator';
  setMode: (mode: 'buyer' | 'creator') => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [userId, setUserIdState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [mode, setModeState] = useState<'buyer' | 'creator'>('buyer');

  useEffect(() => {
    try {
      setUserIdState(window.localStorage.getItem(CHAVE));
      setModeState(window.localStorage.getItem('nadm.mode') === 'creator' ? 'creator' : 'buyer');
    } catch { /* Private browsing may disable storage. */ }
    setReady(true);
  }, []);

  const setUserId = useCallback((id: string | null) => {
    try {
      if (id) window.localStorage.setItem(CHAVE, id);
      else window.localStorage.removeItem(CHAVE);
    } catch { /* The current in-memory session still works. */ }
    setProfile(null);
    setProfileReady(false);
    setProfileError(null);
    setUserIdState(id);
  }, []);

  const setMode = useCallback((value: 'buyer' | 'creator') => {
    setModeState(value);
    try { window.localStorage.setItem('nadm.mode', value); } catch { /* Optional preference. */ }
  }, []);
  const refreshProfile = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!ready) return;
    let live = true;
    setProfileReady(false);
    setProfileError(null);
    if (!userId) { setProfile(null); setProfileReady(true); return; }
    void api<PublicProfile>('/profiles/me', { actorUserId: userId }).then(value => {
      if (live) setProfile(value);
    }).catch(error => {
      if (!live) return;
      setProfile(null);
      if (!(error instanceof ApiError && error.status === 404)) {
        setProfileError(error instanceof Error ? error.message : 'Não foi possível carregar a conta.');
      }
    }).finally(() => { if (live) setProfileReady(true); });
    return () => { live = false; };
  }, [userId, ready, revision]);

  const value = useMemo(() => ({ userId, setUserId, ready, profile, profileReady, profileError, refreshProfile, mode, setMode }), [userId, setUserId, ready, profile, profileReady, profileError, refreshProfile, mode, setMode]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);

  if (!value) {
    throw new Error('useSession precisa de estar dentro de <SessionProvider>');
  }

  return value;
}
