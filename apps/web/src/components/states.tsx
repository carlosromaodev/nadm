import Link from 'next/link';
import { FlorAGirar } from './flor';

/** Os três pontos do design, enquanto a resposta não chega. */
export function ACarregar() {
  return (
    <div className="flex flex-1 items-center justify-center gap-1.5 py-20" role="status">
      <FlorAGirar className="size-10" legenda="A carregar" />
    </div>
  );
}

/**
 * Enquanto DP-01 não fechar não há sessão a sério, e é preciso escolher em nome
 * de quem se está a pedir.
 */
export function AvisoSemSessao() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-[16px] font-[900]">Entra para continuar</p>
      <p className="max-w-[28ch] text-[13px] font-[700] leading-[1.5] text-dim">
        A tua conta reúne os teus pedidos, conversas e conteúdos.
      </p>
      <Link href="/entrar" className="text-[13px] font-[900] text-lime-text">
        Entrar na NaDM
      </Link>
    </div>
  );
}
