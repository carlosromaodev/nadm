'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemePreference = 'system' | 'dark' | 'light';
const ThemeContext = createContext({ theme: 'dark' as 'dark' | 'light', preference: 'system' as ThemePreference, setTheme: (_value: ThemePreference) => {} });
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, update] = useState<ThemePreference>('system');
  const [systemDark, setSystemDark] = useState(true);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try { const saved = localStorage.getItem('nadm.theme'); if (saved === 'light' || saved === 'dark' || saved === 'system') update(saved); } catch { /* Optional preference. */ }
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const changed = () => setSystemDark(media.matches);
    changed(); media.addEventListener('change', changed); setReady(true);
    return () => media.removeEventListener('change', changed);
  }, []);
  const theme = preference === 'system' ? systemDark ? 'dark' : 'light' : preference;
  useEffect(() => { if (ready) { document.documentElement.dataset.skin = theme; document.documentElement.style.colorScheme = theme; } }, [theme, ready]);
  function setTheme(value: ThemePreference) { update(value); try { localStorage.setItem('nadm.theme', value); } catch { /* Optional preference. */ } }
  return <ThemeContext.Provider value={{ theme, preference, setTheme }}>{children}</ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);
