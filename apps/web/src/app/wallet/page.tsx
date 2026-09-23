'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AppSheet } from '@/components/app-sheet';
import { Icon } from '@/components/icon';
import { CreatorBoundary, creatorLink } from '@/components/creator-ui';
import { Flor } from '@/components/flor';
import { Screen } from '@/components/screen';
import { LinhaDeSeccao, StudioHeader } from '@/components/studio-nav';
import { Botao, Pastilha, Rotulo, Vazio } from '@/components/ui';
import { api, ApiError, type Payout } from '@/lib/api';
import { identityState, parseKwanza, useCreatorData } from '@/lib/creator-api';
import { formatMoney } from '@/lib/money';
import { useSession } from '@/lib/session';

const ESTADO_DO_LEVANTAMENTO: Record<Payout['status'], { rotulo: string; tom: 'ok' | 'espera' | 'mau' }> = {
  REQUESTED: { rotulo: 'à espera de aprovação', tom: 'espera' },
  APPROVED: { rotulo: 'aprovado', tom: 'espera' },
  PROCESSING: { rotulo: 'a caminho', tom: 'espera' },
  PAID: { rotulo: 'pago', tom: 'ok' },
  FAILED: { rotulo: 'falhou', tom: 'mau' },
  CANCELLED: { rotulo: 'cancelado', tom: 'mau' },
};

export default function WalletPage() {
  const { userId } = useSession();
  const state = useCreatorData();
  const [payoutInfo, setPayoutInfo] = useState(false);
  const [valor, setValor] = useState('');
  const [destino, setDestino] = useState('');
  const [erroLevantamento, setErroLevantamento] = useState<string | null>(null);
  const [aLevantar, setALevantar] = useState(false);
  const wallet = state.data?.wallet;
  const identidade = identityState(state.data?.identity ?? []);
  const levantamentos = state.data?.payouts ?? [];

  async function pedirLevantamento() {
    const minor = parseKwanza(valor);
    if (!minor || !userId) return;

    setALevantar(true);
    setErroLevantamento(null);

    try {
      await api('/payouts', {
        method: 'POST',
        actorUserId: userId,
        body: { amountMinor: minor, method: 'BANK_TRANSFER', destination: destino.trim() },
      });
      setPayoutInfo(false);
      setValor('');
      setDestino('');
      state.reload();
    } catch (cause) {
      setErroLevantamento(
        cause instanceof ApiError ? cause.message : 'O pedido de levantamento falhou.',
      );
    } finally {
      setALevantar(false);
    }
  }

  async function cancelarLevantamento(payoutId: string) {
    if (!userId) return;

    try {
      await api(`/payouts/${payoutId}/cancel`, { method: 'POST', actorUserId: userId });
      state.reload();
    } catch (cause) {
      setErroLevantamento(
        cause instanceof ApiError ? cause.message : 'Não foi possível cancelar.',
      );
    }
  }
  function exportStatement() {
    if (!wallet) return;
    const rows = [['Data', 'Descrição', 'Direcção', 'Valor (cêntimos)', 'Moeda', 'Pedido'], ...wallet.entries.map((entry) => [entry.occurredAt, entry.description, entry.direction, entry.amount.amount, entry.amount.currency, entry.dealId ?? ''])];
    const csv = rows.map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'nadm-movimentos.csv'; anchor.click(); URL.revokeObjectURL(url);
  }
  return <Screen header={<StudioHeader titulo="Carteira" subtitulo="Os teus ganhos, sempre à mão" />}>
    <CreatorBoundary {...state} loading={!state.data} retry={state.reload}>{wallet && <>
      <div className="wallet-highlight relative overflow-hidden rounded-[28px] bg-lime px-[18px] py-5 text-lime-ink"><Flor className="pointer-events-none absolute -right-10 -bottom-11 size-[162px] opacity-[0.14]" fill="var(--color-lime-ink)" /><div className="relative"><p className="text-[10px] font-[800] uppercase tracking-[0.14em] opacity-70">Disponível para levantar</p><div className="algarismos my-1 text-[38px] font-[1000] tracking-[-0.045em]">{formatMoney(wallet.available)}</div><p className="text-[12px] font-[800] opacity-75">Dos teus trabalhos concluídos</p>{identidade.verified ? <button type="button" onClick={() => setPayoutInfo(true)} aria-haspopup="dialog" className="mt-4 flex h-[46px] w-full items-center justify-center rounded-full bg-lime-ink text-[14px] font-[900] text-[#e1f83b]">Levantar</button> : <Link href="/wallet/identidade" className="mt-4 flex h-[46px] w-full items-center justify-center rounded-full bg-lime-ink text-[14px] font-[900] text-[#e1f83b]">{identidade.pending ? 'Identidade em análise' : 'Verificar identidade para levantar'}</Link>}</div></div>
      {payoutInfo && <AppSheet title="Levantar" onClose={() => setPayoutInfo(false)}>
        <p className="text-[13px] font-bold leading-relaxed text-dim">Tens {formatMoney(wallet.available)} disponíveis. O valor sai da carteira assim que pedires, e volta se o levantamento for cancelado ou falhar.</p>
        <label className="mt-4 block rounded-[20px] border border-line bg-surface px-3.5 py-3"><Rotulo>Quanto queres levantar</Rotulo><input value={valor} onChange={(evento) => setValor(evento.target.value)} inputMode="numeric" placeholder="10 000" aria-label="Valor a levantar, em Kwanzas" className="algarismos mt-1.5 w-full bg-transparent text-[20px] font-[1000] outline-none placeholder:text-dim" /></label>
        <label className="mt-2.5 block rounded-[20px] border border-line bg-surface px-3.5 py-3"><Rotulo>IBAN de destino</Rotulo><input value={destino} onChange={(evento) => setDestino(evento.target.value)} autoComplete="off" placeholder="AO06 0000 0000 0000 0000 0000 0" aria-label="IBAN de destino" className="algarismos mt-1.5 w-full bg-transparent text-[13.5px] font-[900] outline-none placeholder:text-dim" /></label>
        {erroLevantamento ? <p className="mt-2.5 text-[12px] font-[800] text-danger" role="alert">{erroLevantamento}</p> : null}
        <Botao bloco className="mt-4" onClick={() => void pedirLevantamento()} disabled={aLevantar || !parseKwanza(valor) || destino.trim().length < 6}>{aLevantar ? 'A pedir…' : 'Pedir levantamento'}</Botao>
        <p className="mt-2 text-center text-[11px] font-[700] text-dim">A NaDM confirma e envia. Enquanto não for aprovado, podes cancelar.</p>
      </AppSheet>}
      <div className="mt-2.5 grid grid-cols-2 gap-2.5"><div className="rounded-[22px] border border-line bg-surface p-3.5"><Rotulo>Retido em trabalhos</Rotulo><p className="algarismos mt-1 text-[22px] font-[1000]">{formatMoney(wallet.reserved)}</p></div><div className="rounded-[22px] border border-line bg-surface p-3.5"><Rotulo>Pendente</Rotulo><p className="algarismos mt-1 text-[22px] font-[1000]">{formatMoney(wallet.pending)}</p></div></div>
      <div className="mt-3"><LinhaDeSeccao href="/estudio/perfil?tab=account" titulo="Dados de recebimento" nota={state.data?.profile.settings?.expressPhone ? 'Número Express guardado · por verificar' : 'Adicionar número Express'} icone={<Icon name="phone" />} /></div>
      <button type="button" onClick={exportStatement} disabled={!wallet.entries.length} className="mt-2 min-h-12 w-full rounded-[22px] border border-line bg-wash px-4 text-left text-[13px] font-[900] disabled:opacity-40">Exportar movimentos · CSV ↓</button><p className="mt-1 px-2 text-[11px] font-[700] text-dim">Extracto informativo. Não substitui recibo fiscal.</p>
      {levantamentos.length ? <div className="mt-5"><Rotulo>Levantamentos</Rotulo><div className="mt-2">{levantamentos.map((payout) => { const estado = ESTADO_DO_LEVANTAMENTO[payout.status]; return <div key={payout.id} className="flex items-center gap-3 border-b border-line py-3"><div className="min-w-0 flex-1"><p className="algarismos truncate text-[13px] font-[900]">{formatMoney(payout.amount)} · {payout.destination}</p><p className="mt-0.5 text-[11px] font-[700] text-dim">{new Date(payout.requestedAt).toLocaleString('pt-AO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{payout.failureReason ? ` · ${payout.failureReason}` : ''}</p></div><Pastilha tom={estado.tom}>{estado.rotulo}</Pastilha>{payout.status === 'REQUESTED' ? <button type="button" onClick={() => void cancelarLevantamento(payout.id)} className="shrink-0 text-[11.5px] font-[900] text-danger">Cancelar</button> : null}</div>; })}</div></div> : null}

      <div className="mt-5 mb-2 flex items-baseline justify-between"><Rotulo>Movimentos</Rotulo><span className="text-[11px] font-[800] text-dim">{wallet.entries.length} mais recentes</span></div>
      {wallet.entries.length ? <div>{wallet.entries.map((entry) => <div key={entry.id} className="flex items-center gap-3 border-b border-line py-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-[13px] bg-surface2 font-black text-lime-text">{entry.direction === 'CREDIT' ? '↓' : '↑'}</span><div className="min-w-0 flex-1">{entry.dealId ? <Link href={`/deals/${entry.dealId}`} className="block truncate text-[13px] font-[900]">{entry.description}</Link> : <p className="truncate text-[13px] font-[900]">{entry.description}</p>}<p className="mt-0.5 text-[11px] font-[700] text-dim">{new Date(entry.occurredAt).toLocaleString('pt-AO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p></div><span className={`algarismos shrink-0 text-[13px] font-[1000] ${entry.direction === 'CREDIT' ? 'text-lime-text' : 'text-dim'}`}>{entry.direction === 'CREDIT' ? '+' : '−'}{formatMoney(entry.amount)}</span></div>)}</div> : <Vazio titulo="Ainda sem movimentos" texto="Os valores dos teus trabalhos aparecem aqui quando forem registados." accao={<Link href="/estudio/ofertas" className={creatorLink}>Ver as minhas ofertas</Link>} />}
    </>}</CreatorBoundary>
  </Screen>;
}
