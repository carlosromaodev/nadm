'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useSession } from '@/lib/session';
import { isCreatorRoute, isPrivateRoute, loginHref } from '@/lib/navigation';
import { FlorAGirar } from './flor';
import { Botao } from './ui';
import './responsive-shell.css';

export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { ready, userId, profile, profileReady, profileError, refreshProfile } = useSession();
  const needsSession = isPrivateRoute(pathname);
  const needsCreator = isCreatorRoute(pathname);

  useEffect(() => {
    let frame = 0;
    const resize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const viewport = window.visualViewport;
        // Pinch zoom must magnify, not continuously reflow the application.
        if (viewport && viewport.scale !== 1) return;
        const height = viewport?.height ?? window.innerHeight;
        document.documentElement.style.setProperty('--app-height', `${height}px`);
        document.documentElement.toggleAttribute('data-compact-height', height <= 520);
      });
    };
    resize();
    window.visualViewport?.addEventListener('resize', resize);
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(frame); window.visualViewport?.removeEventListener('resize', resize); window.removeEventListener('resize', resize); };
  }, []);
  useEffect(() => {
    if (ready && needsSession && !userId) router.replace(loginHref(pathname + window.location.search));
  }, [ready, userId, needsSession, pathname, router]);

  let content = children;
  if (needsSession && (!ready || !userId || (needsCreator && !profileReady))) {
    content = <div className="flex flex-1 items-center justify-center"><FlorAGirar className="size-12" legenda="A abrir a tua conta" /></div>;
  } else if (needsCreator && profileError) {
    content = <div role="alert" className="m-auto p-6 text-center"><h1 className="text-xl font-black">Não conseguimos abrir o estúdio</h1><p className="my-4 text-dim">{profileError}</p><Botao onClick={refreshProfile}>Tentar novamente</Botao></div>;
  } else if (needsCreator && !profile) {
    content = <div className="m-auto p-6 text-center"><h1 className="text-2xl font-black">O teu espaço de criador</h1><p className="my-4 text-dim">Cria o teu perfil público para publicar e receber pedidos.</p><Link className="block rounded-full bg-lime p-4 font-black text-lime-ink" href="/criar-perfil?role=creator">Criar perfil de criador</Link><Link className="mt-5 block text-lime-text" href="/inicio">Continuar como espectador</Link></div>;
  }
  return <div className="app-frame flex h-[var(--app-height,100dvh)] min-h-0 w-full flex-col overflow-hidden">{content}</div>;
}
