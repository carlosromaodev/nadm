'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Screen, TituloComVolta } from '@/components/screen';
import { ACarregar, AvisoSemSessao } from '@/components/states';
import { Botao, Pastilha, Rotulo } from '@/components/ui';
import { api, ApiError, type IdentityVerification } from '@/lib/api';
import { identityState, useCreatorData } from '@/lib/creator-api';
import { useSession } from '@/lib/session';

const TIPOS = [
  { valor: 'BI', rotulo: 'Bilhete de identidade' },
  { valor: 'PASSPORT', rotulo: 'Passaporte' },
  { valor: 'NIF', rotulo: 'NIF' },
] as const;

/**
 * Verificar a identidade é o que destranca os levantamentos (RN-051).
 *
 * O número do documento entra aqui e **não volta a sair**: o que o servidor
 * devolve é sempre a máscara, e é ela que este ecrã mostra depois de submeter.
 */
export default function IdentidadePage() {
  const router = useRouter();
  const { userId, ready } = useSession();
  const state = useCreatorData();

  const [tipo, setTipo] = useState<(typeof TIPOS)[number]['valor']>('BI');
  const [numero, setNumero] = useState('');
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aTrabalhar, setATrabalhar] = useState(false);

  if (!ready) return null;
  if (!userId) return <AvisoSemSessao />;
  if (!state.data) return <ACarregar />;

  const identidade = identityState(state.data.identity);
  const ultima: IdentityVerification | undefined = state.data.identity[0];

  async function submeter() {
    setATrabalhar(true);
    setErro(null);

    try {
      await api('/identity-verifications', {
        method: 'POST',
        actorUserId: userId!,
        body: { documentType: tipo, documentNumber: numero.trim(), fullName: nome.trim() },
      });
      router.push('/wallet');
    } catch (cause) {
      setErro(cause instanceof ApiError ? cause.message : 'Não foi possível submeter.');
      setATrabalhar(false);
    }
  }

  const podeSubmeter = numero.trim().length >= 4 && nome.trim().length >= 2;

  return (
    <Screen
      header={
        <TituloComVolta
          voltarPara="/wallet"
          titulo="Verificar identidade"
          subtitulo="Preciso uma vez, para poderes levantar"
        />
      }
      footer={
        identidade.verified || identidade.pending ? (
          <Botao bloco onClick={() => router.push('/wallet')}>
            Voltar à carteira
          </Botao>
        ) : (
          <>
            {erro ? (
              <p className="mb-2.5 text-[12px] font-[800] text-danger" role="alert">
                {erro}
              </p>
            ) : null}
            <Botao bloco onClick={() => void submeter()} disabled={!podeSubmeter || aTrabalhar}>
              {aTrabalhar ? 'A enviar…' : 'Enviar para verificação'}
            </Botao>
            <p className="mt-2 text-center text-[11px] font-[700] text-dim">
              A NaDM confere os dados e responde. O número fica guardado cifrado e nunca aparece
              noutro ecrã.
            </p>
          </>
        )
      }
    >
      {identidade.verified ? (
        <div className="rounded-[22px] border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-[900]">Identidade verificada</span>
            <Pastilha tom="ok">verificada</Pastilha>
          </div>
          <p className="mt-2 text-[12.5px] font-[700] leading-[1.5] text-dim">
            Já podes pedir levantamentos na carteira.
          </p>
        </div>
      ) : identidade.pending ? (
        <div className="rounded-[22px] border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-[900]">À espera de decisão</span>
            <Pastilha tom="espera">em análise</Pastilha>
          </div>
          <p className="mt-2 text-[12.5px] font-[700] leading-[1.5] text-dim">
            Submeteste {ultima ? `o documento ${ultima.documentNumber}` : 'os teus dados'}. A NaDM
            avisa-te assim que houver resposta.
          </p>
        </div>
      ) : (
        <>
          {identidade.rejected ? (
            <div className="mb-2.5 rounded-[22px] border border-danger/40 bg-surface p-3.5">
              <Rotulo>Não foi aceite</Rotulo>
              <p className="mt-1.5 text-[12.5px] font-[700] leading-[1.5]">
                {identidade.rejected.rejectionReason}
              </p>
              <p className="mt-1.5 text-[11.5px] font-[700] text-dim">
                Corrige e envia outra vez.
              </p>
            </div>
          ) : null}

          <div className="rounded-[22px] border border-line bg-surface p-3.5">
            <Rotulo>Tipo de documento</Rotulo>
            <div className="mt-2 flex flex-wrap gap-2">
              {TIPOS.map((opcao) => (
                <button
                  key={opcao.valor}
                  type="button"
                  onClick={() => setTipo(opcao.valor)}
                  aria-pressed={tipo === opcao.valor}
                  className={`h-10 rounded-full px-3.5 text-[12.5px] font-[900] ${
                    tipo === opcao.valor
                      ? 'bg-lime text-lime-ink'
                      : 'border border-line text-dim'
                  }`}
                >
                  {opcao.rotulo}
                </button>
              ))}
            </div>
          </div>

          <label className="mt-2.5 block rounded-[22px] border border-line bg-surface p-3.5">
            <Rotulo>Número do documento</Rotulo>
            <input
              value={numero}
              onChange={(evento) => setNumero(evento.target.value)}
              maxLength={40}
              autoComplete="off"
              placeholder="003456789LA041"
              className="algarismos mt-2 w-full bg-transparent text-[15px] font-[900] outline-none placeholder:text-dim"
            />
          </label>

          <label className="mt-2.5 block rounded-[22px] border border-line bg-surface p-3.5">
            <Rotulo>Nome completo, como está no documento</Rotulo>
            <input
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
              maxLength={160}
              autoComplete="name"
              placeholder="Nelson Domingos"
              className="mt-2 w-full bg-transparent text-[15px] font-[900] outline-none placeholder:text-dim"
            />
          </label>
        </>
      )}
    </Screen>
  );
}
