'use client';

import { useCallback, useEffect, useState } from 'react';
import { Screen } from '@/components/screen';
import { ACarregar, AvisoSemSessao } from '@/components/states';
import { Botao, Pastilha, Rotulo, Vazio } from '@/components/ui';
import {
  api,
  ApiError,
  NOME_DA_DIVERGENCIA,
  type PlatformMetrics,
  type ReconciliationFinding,
} from '@/lib/api';
import { formatMinor } from '@/lib/money';
import { useSession } from '@/lib/session';

/**
 * O painel de operação.
 *
 * É a única parte do produto em que o papel decide o acesso, e por isso a única
 * em que um 403 é a resposta certa — quem aqui chega sem ser administração não
 * fica a saber nada que já não soubesse.
 *
 * As divergências aparecem por gravidade. **Fechar uma não corrige nada**: o
 * que faz é registar que alguém olhou, decidiu e disse o quê.
 */
export default function AdminPage() {
  const { userId, ready } = useSession();

  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [findings, setFindings] = useState<ReconciliationFinding[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [semAcesso, setSemAcesso] = useState(false);
  const [aTrabalhar, setATrabalhar] = useState(false);

  const carregar = useCallback(async () => {
    if (!userId) return;

    try {
      const [m, f] = await Promise.all([
        api<PlatformMetrics>('/admin/metrics', { actorUserId: userId }),
        api<{ data: ReconciliationFinding[] }>('/admin/reconciliation', {
          actorUserId: userId,
        }),
      ]);

      setMetrics(m);
      setFindings(f.data);
      setSemAcesso(false);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 403) {
        setSemAcesso(true);
        return;
      }

      setErro(cause instanceof Error ? cause.message : 'Não foi possível abrir o painel.');
    }
  }, [userId]);

  useEffect(() => {
    if (ready) void carregar();
  }, [ready, carregar]);

  if (!ready) return null;
  if (!userId) return <AvisoSemSessao />;

  if (semAcesso) {
    return (
      <Screen header={<h1 className="text-[19px] font-[1000]">Operação</h1>}>
        <Vazio
          titulo="Esta área é da administração"
          texto="A tua conta não tem acesso a esta parte da NaDM."
        />
      </Screen>
    );
  }

  if (!metrics || !findings) return <ACarregar />;

  async function correrReconciliacao() {
    setATrabalhar(true);
    setErro(null);

    try {
      await api('/admin/reconciliation/run', { method: 'POST', actorUserId: userId! });
      await carregar();
    } catch (cause) {
      setErro(cause instanceof Error ? cause.message : 'A reconciliação falhou.');
    } finally {
      setATrabalhar(false);
    }
  }

  async function fechar(id: string, outcome: 'RESOLVED' | 'ACCEPTED') {
    const note = window.prompt(
      outcome === 'RESOLVED'
        ? 'O que foi feito para corrigir?'
        : 'Porque é que fica assim?',
    );

    if (!note?.trim()) return;

    try {
      await api(`/admin/reconciliation/${id}/close`, {
        method: 'POST',
        actorUserId: userId!,
        body: { outcome, note: note.trim() },
      });
      await carregar();
    } catch (cause) {
      setErro(cause instanceof Error ? cause.message : 'Não foi possível fechar.');
    }
  }

  const criticas = findings.filter((f) => f.severity === 'CRITICAL');

  return (
    <Screen
      header={
        <div>
          <h1 className="text-[19px] font-[1000]">Operação</h1>
          <p className="text-[11.5px] font-[700] text-dim">
            {criticas.length
              ? `${criticas.length} divergência(s) crítica(s) por resolver`
              : 'Sem divergências críticas'}
          </p>
        </div>
      }
      footer={
        <>
          {erro ? (
            <p className="mb-2.5 text-[12px] font-[800] text-danger" role="alert">
              {erro}
            </p>
          ) : null}
          <Botao bloco onClick={() => void correrReconciliacao()} disabled={aTrabalhar}>
            {aTrabalhar ? 'A cruzar…' : 'Correr reconciliação agora'}
          </Botao>
          <p className="mt-2 text-center text-[11px] font-[700] text-dim">
            Cruza e regista. Nenhuma correcção é automática.
          </p>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        <Cartao rotulo="Disputas" valor={metrics.filas.disputasAbertas} />
        <Cartao rotulo="Levantamentos" valor={metrics.filas.levantamentosPorDecidir} />
        <Cartao rotulo="Identidades" valor={metrics.filas.identidadesPorDecidir} />
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-2">
        <Cartao rotulo="Retido" valor={`${formatMinor(metrics.dinheiro.retidoMinor)} Kz`} />
        <Cartao rotulo="Libertado" valor={`${formatMinor(metrics.dinheiro.libertadoMinor)} Kz`} />
        <Cartao rotulo="Devolvido" valor={`${formatMinor(metrics.dinheiro.devolvidoMinor)} Kz`} />
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-2">
        <Cartao rotulo="Pedidos" valor={metrics.negocio.dealsCriados} />
        <Cartao rotulo="Concluídos" valor={metrics.negocio.dealsConcluidos} />
        <Cartao rotulo="Eventos por enviar" valor={metrics.integridade.eventosPorProcessar} />
      </div>

      <div className="mt-5 mb-2">
        <Rotulo>Divergências abertas</Rotulo>
      </div>

      {findings.length ? (
        <div>
          {findings.map((finding) => (
            <div key={finding.id} className="border-b border-line py-3">
              <div className="flex items-start justify-between gap-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-[900]">
                    {NOME_DA_DIVERGENCIA[finding.kind] ?? finding.kind}
                  </p>
                  <p className="mt-1 text-[11.5px] font-[700] leading-[1.45] text-dim">
                    {finding.detail}
                  </p>
                  <p className="algarismos mt-1 text-[11px] font-[700] text-dim">
                    {finding.subjectType} · {finding.subjectId.slice(0, 8)} ·{' '}
                    {new Date(finding.detectedAt).toLocaleString('pt-AO', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <Pastilha tom={finding.severity === 'CRITICAL' ? 'mau' : 'espera'}>
                  {finding.severity === 'CRITICAL' ? 'crítica' : 'aviso'}
                </Pastilha>
              </div>

              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => void fechar(finding.id, 'RESOLVED')}
                  className="h-9 rounded-full border border-line px-3 text-[11.5px] font-[900]"
                >
                  Corrigi
                </button>
                <button
                  type="button"
                  onClick={() => void fechar(finding.id, 'ACCEPTED')}
                  className="h-9 rounded-full px-3 text-[11.5px] font-[900] text-dim"
                >
                  Fica assim
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Vazio
          titulo="Nada por resolver"
          texto="O que o sistema diz e o que o sistema fez batem certo."
        />
      )}
    </Screen>
  );
}

function Cartao({ rotulo, valor }: { rotulo: string; valor: number | string }) {
  return (
    <div className="rounded-[18px] border border-line bg-surface p-3">
      <p className="text-[10px] font-[800] uppercase tracking-[0.1em] text-dim">{rotulo}</p>
      <p className="algarismos mt-1 text-[17px] font-[1000] tracking-[-0.02em]">{valor}</p>
    </div>
  );
}
