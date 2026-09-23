import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { BottomNav } from './bottom-nav';

/** `typedRoutes` do Next torna o `href` um tipo próprio; aceitamo-lo como tal. */
type Href = ComponentProps<typeof Link>['href'];

/**
 * O esqueleto que todos os ecrãs do design partilham: cabeçalho fixo, corpo
 * rolável, rodapé fixo com a acção principal. É esta forma que faz o teclado
 * caber sem empurrar a acção para fora do ecrã.
 */
export function Screen({
  children,
  header,
  footer,
  contentClassName = '',
}: {
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  contentClassName?: string;
}) {
  return (
    <div className="app-screen flex h-full min-h-0 flex-1 flex-col">
      <a className="skip-link" href="#conteudo">Saltar para o conteúdo</a>
      {header ? <header className="screen-header safe-top flex-none px-4 pb-2.5">{header}</header> : null}
      <main id="conteudo" tabIndex={-1} className={`screen-content rolo min-h-0 flex-1 px-4 pt-0.5 pb-3 ${!header ? 'safe-top' : ''} ${contentClassName}`}>{children}</main>
      {footer ? (
        <footer className="screen-footer safe-bottom flex-none border-t border-line bg-bg px-4 pt-2.5">{footer}</footer>
      ) : null}
      <BottomNav />
    </div>
  );
}

export function Voltar({ href, label = 'Voltar' }: { href: Href; label?: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line"
    >
      <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
        <path
          d="M14.5 5.5 8 12l6.5 6.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}

/** Cabeçalho com seta de voltar, título e subtítulo. */
export function TituloComVolta({
  voltarPara,
  titulo,
  subtitulo,
}: {
  voltarPara: Href;
  titulo: string;
  subtitulo?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Voltar href={voltarPara} />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[14.5px] font-[900]">{titulo}</h1>
        {subtitulo ? (
          <div className="algarismos truncate text-[11.5px] font-[700] text-dim">{subtitulo}</div>
        ) : null}
      </div>
    </div>
  );
}

/** A barra de progresso fina do topo do briefing. */
export function Progresso({ pct }: { pct: number }) {
  return (
    <div className="mt-2.5 h-[5px] overflow-hidden rounded-full bg-surface2">
      <div
        className="h-full rounded-full bg-lime transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
