'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from '@/lib/session';
import { Icon, type IconName } from './icon';

const viewer = [
  { href: '/inicio', label: 'Início', icon: 'home' },
  { href: '/descobrir', label: 'Descobrir', icon: 'search' },
  { href: '/conversas', label: 'DM', icon: 'chat' },
  { href: '/meu', label: 'Meu', icon: 'bookmark' },
];
export function BottomNav() {
  const pathname = usePathname();
  const { profile, mode, setMode } = useSession();
  const creator = pathname.startsWith('/estudio') || pathname === '/wallet' || (mode === 'creator' && !!profile && (pathname === `/${profile.handle}` || pathname === `/${profile.handle}/partilhar`)) || (['/notificacoes', '/seguranca', '/definicoes'].includes(pathname) && mode === 'creator');
  const show = creator || (profile && pathname === '/' + profile.handle) || ['/inicio', '/descobrir', '/conversas', '/meu', '/deals', '/notificacoes', '/seguranca', '/definicoes'].includes(pathname) || pathname.endsWith('/partilhar');
  if (!show || pathname.startsWith('/estudio/pedidos/')) return null;
  const items = creator ? [
    { href: '/estudio', label: 'Painel', icon: 'home' },
    { href: '/estudio/caixa', label: 'Caixa', icon: 'inbox' },
    { href: '/estudio/publicar', label: 'Criar', icon: 'plus' },
    { href: profile ? `/${profile.handle}` : '/estudio/perfil', label: 'Perfil', icon: 'user' },
  ] : viewer;
  return <nav aria-label={creator ? 'Navegação do criador' : 'Navegação do espectador'} className="app-nav grid flex-none grid-cols-4 gap-0.5 border-t border-line bg-bg px-2 pt-[7px] pb-[max(8px,env(safe-area-inset-bottom))]">
    <div className="nav-brand" aria-hidden="true"><span>NaDM</span><small>{creator ? 'O teu estúdio' : 'O teu espaço'}</small></div>
    {items.map(item => {
      const active = pathname === item.href || (item.href === '/meu' && pathname === '/deals') || (creator && item.label === 'Perfil' && pathname === '/estudio/perfil');
      return <Link key={item.href} href={item.href} onClick={() => setMode(creator ? 'creator' : 'buyer')} aria-current={active ? 'page' : undefined} className={`flex min-h-[52px] flex-col items-center gap-[3px] rounded-2xl pb-[7px] text-[10px] tracking-[.01em] ${active ? 'font-[900] text-ink' : 'font-extrabold text-dim'}`}>
        <span className={`flex h-[31px] w-[46px] items-center justify-center rounded-full ${active ? 'bg-lime text-lime-ink' : ''}`}><Icon name={item.icon as IconName} className="size-5" strokeWidth="2.6" /></span>{item.label}
      </Link>;
    })}
  </nav>;
}
