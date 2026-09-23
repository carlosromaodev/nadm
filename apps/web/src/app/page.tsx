'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { FlorAGirar } from '@/components/flor';
import { Botao } from '@/components/ui';
import { useSession } from '@/lib/session';

/** P0: choose the right home without treating network errors as buyer accounts. */
export default function RaizPage() {
  const router = useRouter();
  const { userId, ready, profile, profileReady, profileError, refreshProfile, mode } = useSession();
  useEffect(() => {
    if (!ready) return;
    if (!userId) { router.replace('/entrar'); return; }
    if (!profileReady || profileError) return;
    router.replace(profile && mode === 'creator' ? '/estudio' : '/inicio');
  }, [ready, userId, profileReady, profileError, profile, router, mode]);
  return <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
    {profileError ? <><h1 className="text-xl font-black">Não foi possível abrir a tua conta</h1><p className="text-dim">{profileError}</p><Botao onClick={refreshProfile}>Tentar novamente</Botao></> : <><FlorAGirar className="size-12" legenda="A entrar" /><span className="text-xs font-extrabold text-dim">A entrar…</span></>}
  </div>;
}
