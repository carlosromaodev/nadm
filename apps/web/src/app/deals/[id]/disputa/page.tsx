'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Screen, TituloComVolta } from '@/components/screen';
import { ACarregar, AvisoSemSessao } from '@/components/states';
import { Botao, Rotulo } from '@/components/ui';
import { api, ApiError, type DealDetail } from '@/lib/api';
import { useSession } from '@/lib/session';

/**
 * Abrir uma disputa.
 *
 * É das poucas acções do produto que não tem dono: o comprador que não recebeu
 * o que pediu e o criador que não consegue entregar têm o mesmo direito de
 * pedir que alguém decida. Abrir não move dinheiro — **trava-o**.
 */
export default function DisputaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { userId, ready } = useSession();

  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aTrabalhar, setATrabalhar] = useState(false);

  const carregar = useCallback(async () => {
    if (!userId) return;
    try {
      setDeal(await api<DealDetail>(`/deals/${id}`, { actorUserId: userId }));
    } catch {
      setErro('Não foi possível abrir o pedido.');
    }
  }, [id, userId]);

  useEffect(() => {
    if (ready) void carregar();
  }, [ready, carregar]);

  if (!ready) return null;
  if (!userId) return <AvisoSemSessao />;
  if (!deal) return <ACarregar />;

  // Já há uma aberta: abrir outra devolveria 409, e oferecê-lo seria mentir.
  const disputavel =
    !deal.dispute && ['ACCEPTED', 'IN_PROGRESS', 'DELIVERED'].includes(deal.status);

  async function abrir() {
    setATrabalhar(true);
    setErro(null);

    try {
      await api(`/deals/${deal!.id}/disputes`, {
        method: 'POST',
        actorUserId: userId!,
        body: { reason: motivo.trim() },
      });
      router.push(`/deals/${deal!.id}`);
    } catch (cause) {
      setErro(cause instanceof ApiError ? cause.message : 'Não foi possível abrir a disputa.');
      setATrabalhar(false);
    }
  }

  return (
    <Screen
      header={
        <TituloComVolta
          voltarPara={`/deals/${deal.id}`}
          titulo="Pedir ajuda da NaDM"
          subtitulo={`${deal.reference} · ${deal.offer.title}`}
        />
      }
      footer={
        disputavel ? (
          <>
            {erro ? (
              <p className="mb-2.5 text-[12px] font-[800] text-danger" role="alert">
                {erro}
              </p>
            ) : null}
            <Botao
              bloco
              onClick={() => void abrir()}
              disabled={aTrabalhar || motivo.trim().length < 1}
            >
              {aTrabalhar ? 'A abrir…' : 'Abrir disputa'}
            </Botao>
            <p className="mt-2 text-center text-[11px] font-[700] text-dim">
              O valor fica retido até a NaDM decidir. Nenhuma das partes recebe entretanto.
            </p>
          </>
        ) : (
          <Botao bloco onClick={() => router.push(`/deals/${deal.id}`)}>
            Voltar à conversa
          </Botao>
        )
      }
    >
      {disputavel ? (
        <>
          <div className="rounded-[22px] border border-line bg-surface p-4">
            <Rotulo>O que acontece a seguir</Rotulo>
            <ul className="mt-2 flex flex-col gap-2 text-[12.5px] font-[700] leading-[1.5] text-dim">
              <li>O valor deixa de poder ser libertado até haver decisão.</li>
              <li>A NaDM lê a conversa e as entregas deste pedido — e só deste.</li>
              <li>A decisão aparece aqui na conversa, com o motivo.</li>
              <li>Enquanto ninguém decidir, podes retirar a disputa a qualquer momento.</li>
            </ul>
          </div>

          <label className="mt-2.5 block rounded-[22px] border border-line bg-surface p-3.5">
            <Rotulo>O que correu mal?</Rotulo>
            <textarea
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              rows={5}
              maxLength={2000}
              placeholder="Conta o que aconteceu, com o máximo de detalhe que conseguires."
              aria-label="Motivo da disputa"
              className="mt-2 w-full resize-none bg-transparent text-[13.5px] font-[700] leading-[1.5] outline-none placeholder:text-dim"
            />
          </label>
        </>
      ) : (
        <div className="rounded-[var(--radius-cartao)] border border-dashed border-line px-4 py-8 text-center text-[13px] font-[700] text-dim">
          {deal.dispute
            ? 'Este pedido já tem uma disputa em análise. A decisão aparece na conversa.'
            : 'Este pedido já não pode ser disputado.'}
        </div>
      )}
    </Screen>
  );
}
