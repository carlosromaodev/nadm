export function safeNext(value: string | null | undefined, fallback = '/'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return fallback;
  try {
    const url = new URL(value, 'https://nadm.local');
    if (url.origin !== 'https://nadm.local' || ['/entrar', '/criar-perfil'].includes(url.pathname)) return fallback;
    return url.pathname + url.search + url.hash;
  } catch { return fallback; }
}

export function loginHref(next: string): string {
  return `/entrar?next=${encodeURIComponent(safeNext(next))}`;
}

export function isCreatorRoute(path: string): boolean {
  return path === '/wallet' || path === '/estudio' || path.startsWith('/estudio/');
}

export function isPrivateRoute(path: string): boolean {
  return isCreatorRoute(path) || ['/inicio', '/meu', '/conversas', '/notificacoes', '/seguranca', '/definicoes', '/marca'].some(base => path === base || path.startsWith(base + '/')) || path === '/deals' || path.startsWith('/deals/');
}
