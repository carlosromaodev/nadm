'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, type DealDetail } from './api';
import { useSession } from './session';

export function useDeal(id: string) {
  const { userId, ready } = useSession();
  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion(current => current + 1), []);
  useEffect(() => {
    if (!ready || !userId) { setDeal(null); return; }
    let active = true;
    setError('');
    const load = () => api<DealDetail>('/deals/' + id, { actorUserId: userId }).then(value => { if (active) { setDeal(value); setError(''); } }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o pedido.'); });
    void load();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 10_000);
    const refresh = () => { void load(); };
    window.addEventListener('focus', refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [id, userId, ready, version]);
  return { deal, setDeal, error, setError, reload, userId, ready };
}
