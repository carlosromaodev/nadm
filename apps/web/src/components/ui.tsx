import Link from 'next/link';
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react';
import type { Tom } from '@/lib/deal-state';

/**
 * Os controlos do design. Tudo vai a pílula, tudo é pesado — o Nunito usa-se
 * aqui entre 800 e 1000, que é o que dá a voz do produto.
 */

const TOM_PASTILHA: Record<Tom, string> = {
  ok: 'bg-lime text-lime-ink',
  espera:
    'text-amber border border-[color-mix(in_oklch,var(--color-amber)_45%,transparent)] bg-[color-mix(in_oklch,var(--color-amber)_20%,transparent)]',
  mau: 'text-danger border border-[color-mix(in_oklch,var(--color-danger)_45%,transparent)] bg-[color-mix(in_oklch,var(--color-danger)_18%,transparent)]',
};

/** A pastilha de estado. Entra a carimbar, como no design. */
export function Pastilha({ tom, children }: { tom: Tom; children: ReactNode }) {
  return (
    <span
      className={`anima-carimbo shrink-0 rounded-full px-[11px] py-[6px] text-[11px] font-[1000] ${TOM_PASTILHA[tom]}`}
    >
      {children}
    </span>
  );
}

type BotaoProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: 'primario' | 'secundario';
  bloco?: boolean;
};

export function Botao({
  variante = 'primario',
  bloco = false,
  className = '',
  type = 'button',
  ...props
}: BotaoProps) {
  const base =
    'toque inline-flex h-14 items-center justify-center gap-2 rounded-full px-5 text-[16.5px] font-[1000] transition-colors disabled:cursor-not-allowed';

  const cor =
    variante === 'primario'
      ? 'bg-lime text-lime-ink enabled:hover:opacity-90 disabled:bg-surface2 disabled:text-dim'
      : 'border-[1.5px] border-line bg-transparent text-ink enabled:hover:bg-wash disabled:text-dim';

  return <button type={type} className={`${base} ${cor} ${bloco ? 'w-full' : ''} ${className}`} {...props} />;
}

export function LinkBotao({ variante = 'primario', bloco = false, className = '', ...props }: ComponentProps<typeof Link> & { variante?: 'primario' | 'secundario'; bloco?: boolean }) {
  return <Link className={`toque inline-flex min-h-14 items-center justify-center gap-2 rounded-full px-5 text-[16.5px] font-[1000] ${variante === 'primario' ? 'bg-lime text-lime-ink' : 'border-[1.5px] border-line text-ink'} ${bloco ? 'w-full' : ''} ${className}`} {...props} />;
}

/** Cápsula de ícone — o quadrado arredondado que o design põe atrás dos ícones. */
export function Capsula({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`flex size-[38px] shrink-0 items-center justify-center rounded-[13px] bg-surface2 ${className}`}
    >
      {children}
    </span>
  );
}

export function Painel({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[var(--radius-painel)] border border-line bg-surface p-[15px] ${className}`}
    >
      {children}
    </div>
  );
}

/** Barra de progresso do pedido. */
export function Barra({ progresso, tom }: { progresso: number; tom: Tom }) {
  const cor =
    tom === 'ok' ? 'var(--color-lime)' : tom === 'espera' ? 'var(--color-amber)' : 'var(--color-danger)';

  return (
    <div className="mt-[10px] mb-[7px] h-[7px] overflow-hidden rounded-full bg-surface2">
      <div
        className="anima-barra h-full rounded-full"
        style={{ width: `${progresso}%`, background: cor }}
      />
    </div>
  );
}

export function Rotulo({ children }: { children: ReactNode }) {
  return <span className="rotulo">{children}</span>;
}

/** Estado vazio — flor esbatida, uma frase e uma saída. */
export function Vazio({
  titulo,
  texto,
  accao,
}: {
  titulo: string;
  texto: string;
  accao?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-[10px] pt-[42px] text-center">
      <svg viewBox="-50 -50 100 100" className="size-[62px] opacity-35" aria-hidden="true">
        <use href="#nadm-flor" fill="var(--color-lime)" />
      </svg>
      <p className="algarismos mt-4 text-[18px] font-[1000] tracking-[-0.025em]">{titulo}</p>
      <p className="mt-1.5 max-w-[26ch] text-[13px] font-[700] leading-[1.55] text-dim">{texto}</p>
      {accao ? <div className="mt-[18px]">{accao}</div> : null}
    </div>
  );
}
