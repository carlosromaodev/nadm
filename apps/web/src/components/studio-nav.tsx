import type { ReactNode } from 'react';
import Link from 'next/link';
import { Voltar } from './screen';

/**
 * O cabeçalho dos ecrãs do estúdio.
 *
 * Título, subtítulo e uma acção à direita. `voltarPara` é opcional porque os
 * ecrãs de primeiro nível — painel, caixa, carteira — não têm para onde voltar
 * que a barra inferior já não dê.
 */
export function StudioHeader({
  titulo,
  subtitulo,
  accao,
  voltarPara,
}: {
  titulo: string;
  subtitulo?: string;
  accao?: ReactNode;
  voltarPara?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      {voltarPara ? <Voltar href={voltarPara} /> : null}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[19px] font-[1000] tracking-[-0.03em]">{titulo}</h1>
        {subtitulo ? (
          <div className="algarismos truncate text-[11.5px] font-[700] text-dim">{subtitulo}</div>
        ) : null}
      </div>
      {accao ? <div className="flex shrink-0 items-center gap-2">{accao}</div> : null}
    </div>
  );
}

/**
 * A linha que liga a outro ecrã.
 *
 * É o padrão que o design usa no P18 para "Recibos e comprovativos": cápsula
 * com ícone, título, nota e seta. Serve de navegação sem inventar chrome.
 */
export function LinhaDeSeccao({
  href,
  titulo,
  nota,
  icone,
}: {
  href: string;
  titulo: string;
  nota: string;
  icone: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="toque flex items-center gap-3 rounded-[22px] border border-line bg-wash px-3.5 py-[13px] transition-colors hover:bg-surface2"
    >
      <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[13px] bg-surface2">
        {icone}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-[900]">{titulo}</div>
        <div className="mt-0.5 text-[11px] font-[700] text-dim">{nota}</div>
      </div>
      <svg viewBox="0 0 24 24" className="size-[15px] shrink-0" aria-hidden="true">
        <path
          d="M9.5 5.5 16 12l-6.5 6.5"
          fill="none"
          stroke="var(--color-dim)"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}
