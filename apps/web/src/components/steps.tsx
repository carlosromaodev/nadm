import type { PassoVisual, Tom } from '@/lib/deal-state';

const COR_TOM: Record<Tom, string> = {
  ok: 'bg-lime',
  espera: 'bg-amber',
  mau: 'bg-danger',
};

/**
 * Os quatro passos do pedido (P8). São sempre os mesmos e sempre pela mesma
 * ordem — o passo actual leva a cor do estado geral do pedido, os concluídos
 * ficam a lima, e os futuros ficam em contorno.
 */
export function Steps({ passos, tom = 'ok' }: { passos: PassoVisual[]; tom?: Tom }) {
  return (
    <ol className="flex flex-col">
      {passos.map((passo, indice) => (
        <li key={passo.chave} className="flex gap-3">
          <div className="flex w-[13px] flex-none flex-col items-center">
            <Marcador estado={passo.estado} tom={tom} />
            {indice < passos.length - 1 ? (
              <span
                className={`w-[2px] flex-1 ${
                  passo.estado === 'feito' ? 'bg-lime' : 'bg-line'
                }`}
              />
            ) : null}
          </div>

          <div className="pb-3.5">
            <div
              className={`text-[13px] font-[900] ${
                passo.estado === 'futuro' ? 'text-dim' : ''
              }`}
            >
              {passo.titulo}
            </div>
            <div className="mt-0.5 text-[11.5px] font-[700] leading-[1.45] text-dim">
              {passo.detalhe}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Marcador({ estado, tom }: { estado: PassoVisual['estado']; tom: Tom }) {
  if (estado === 'futuro') {
    return <span className="size-[13px] shrink-0 rounded-full border-2 border-line" />;
  }

  const cor = estado === 'agora' ? COR_TOM[tom] : 'bg-lime';
  return <span className={`size-[13px] shrink-0 rounded-full ${cor}`} />;
}
