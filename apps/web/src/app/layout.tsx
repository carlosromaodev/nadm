import type { Metadata, Viewport } from 'next';
import { Nunito } from 'next/font/google';
import type { ReactNode } from 'react';
import { FlorDefs } from '@/components/flor-defs';
import { SessionProvider } from '@/lib/session';
import { AppFrame } from '@/components/app-frame';
import { ThemeProvider } from '@/components/theme-provider';
import './globals.css';

/**
 * Nunito até ao peso 1000 — o design usa 1000 nos números e nos títulos, e é
 * daí que vem a voz do produto. Sem isso, fica outra coisa.
 */
const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800', '900', '1000'],
  variable: '--font-nunito',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'NaDM',
  description: 'Pede, paga, conversa e recebe — tudo no mesmo sítio.',
};

export const viewport: Viewport = {
  themeColor: '#16281e',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-AO" className={nunito.variable}>
      <body className="min-h-full bg-bg text-ink antialiased">
        <FlorDefs />
        <SessionProvider>
          {/* Mobile-first, com navegação lateral e conteúdo em grelha no desktop. */}
          <ThemeProvider><AppFrame>{children}</AppFrame></ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
