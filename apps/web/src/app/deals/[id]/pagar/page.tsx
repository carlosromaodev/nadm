'use client';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Flor, FlorAGirar } from '@/components/flor';
import { AvisoRetencao, MoneyBreakdown } from '@/components/money-breakdown';
import { Screen, TituloComVolta } from '@/components/screen';
import { ACarregar } from '@/components/states';
import { Botao, LinkBotao, Painel, Rotulo } from '@/components/ui';
import { api, type DealDetail } from '@/lib/api';
import { useSession } from '@/lib/session';

type Phase = 'confirmar'|'aguardar'|'confirmado'|'falhado'|'expirado'|'semrede';
type Intent = { intentId: string; provider: string; status: 'PENDING'|'CREATED'|'CAPTURED'|'FAILED'|'EXPIRED'|'REVERSED'; expiresAt: string; reference?: string };
const TITLES: Record<Phase,string> = { confirmar: 'Confirma os dados', aguardar: 'A aguardar confirmação', confirmado: 'Pagamento confirmado', falhado: 'O pagamento não passou', expirado: 'O pagamento expirou', semrede: 'Não foi possível confirmar' };

export default function PagarPage() {
  const { id } = useParams<{ id: string }>();
  const { userId } = useSession();
  const [deal, setDeal] = useState<DealDetail|null>(null);
  const [intent, setIntent] = useState<Intent|null>(null);
  const [phase, setPhase] = useState<Phase>('confirmar');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);
  const [attempt, setAttempt] = useState('initial');
  const storageKey = 'nadm.payment.' + userId + '.' + id;
  const applyIntent = useCallback((value: Intent) => {
    setIntent(value);
    setPhase(value.status === 'CAPTURED' ? 'confirmado' : value.status === 'FAILED' ? 'falhado' : value.status === 'EXPIRED' ? 'expirado' : 'aguardar');
    try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* Server keeps the financial source of truth. */ }
  }, [storageKey]);

  const load = useCallback(async () => {
    if (!userId) return;
    setError('');
    try {
      const value = await api<DealDetail>('/deals/' + id, { actorUserId: userId });
      setDeal(value);
      if (value.escrowStatus === 'HELD' || value.escrowStatus === 'RELEASED') { setPhase('confirmado'); return; }
      let saved: Intent|null = null;
      try { saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Intent|null; } catch { /* Ignore invalid local metadata. */ }
      if (saved?.intentId) {
        const actual = await api<Intent>('/deals/' + id + '/payments/' + saved.intentId, { actorUserId: userId });
        applyIntent(actual);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não conseguimos carregar o pedido.'); }
  }, [id, userId, storageKey, applyIntent]);
  useEffect(() => { void load(); }, [load]);

  const check = useCallback(async () => {
    if (!userId || !intent) return;
    try {
      const actual = await api<Intent>('/deals/' + id + '/payments/' + intent.intentId, { actorUserId: userId });
      applyIntent(actual); setError('');
    } catch { setPhase('semrede'); setError('O estado está por confirmar. Não inicies outro pagamento até verificarmos este.'); }
  }, [id, userId, intent, applyIntent]);
  useEffect(() => {
    if (phase !== 'aguardar' || !intent) return;
    const timer = setInterval(() => { void check(); }, 3000);
    return () => clearInterval(timer);
  }, [phase, intent, check]);
  useEffect(() => {
    const online = () => { if (intent) void check(); };
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [intent, check]);

  async function start() {
    if (!userId || !deal || actionLock.current || !/^9\d{8}$/.test(phone)) return;
    actionLock.current = true; setBusy(true); setError('');
    try {
      const value = await api<Intent>('/deals/' + id + '/payments', { method: 'POST', actorUserId: userId, idempotencyKey: 'pagar-' + id + '-' + attempt, body: { payerPhone: '+244' + phone } });
      applyIntent(value);
    } catch (reason) {
      setPhase('semrede'); setError(reason instanceof Error ? reason.message : 'Não conseguimos confirmar se a operação foi recebida. Verifica novamente sem criar outro pagamento.');
    } finally { actionLock.current = false; setBusy(false); }
  }
  async function simulate() {
    if (!userId || !intent || intent.provider !== 'fake' || actionLock.current) return;
    actionLock.current = true; setBusy(true);
    try { await api('/deals/' + id + '/payments/' + intent.intentId + '/simulate', { method: 'POST', actorUserId: userId }); await check(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'A confirmação de teste falhou.'); }
    finally { actionLock.current = false; setBusy(false); }
  }
  function retryTerminal() {
    // A new key is only allowed after a terminal state confirmed by the server.
    if (!intent || !['FAILED','EXPIRED'].includes(intent.status)) return;
    setAttempt(crypto.randomUUID()); setIntent(null); setPhase('confirmar'); setError('');
    try { localStorage.removeItem(storageKey); } catch { /* Optional metadata. */ }
  }

  if (!deal) return error ? <Screen header={<TituloComVolta voltarPara={'/deals/' + id} titulo="Pagamento" />}><p role="alert" className="my-5 text-danger">{error}</p><Botao onClick={() => void load()}>Tentar novamente</Botao></Screen> : <ACarregar />;
  if (deal.viewerRole !== 'buyer') return <Screen header={<TituloComVolta voltarPara={'/deals/' + id} titulo="Pagamento do comprador" />}><Painel>Este pagamento pertence ao comprador. Podes acompanhar o estado na conversa.</Painel></Screen>;
  const payable = deal.status === 'PROPOSED' && deal.escrowStatus === 'PENDING';
  return <Screen header={<TituloComVolta voltarPara={'/deals/' + id} titulo="MULTICAIXA Express" subtitulo={deal.reference} />} footer={<>
    {phase === 'confirmado' ? <LinkBotao bloco href={'/deals/' + id + '/estado'}>Ver o pedido</LinkBotao> : !payable ? <LinkBotao bloco href={'/deals/' + id}>Ver estado do pedido</LinkBotao> : phase === 'confirmar' ? <Botao bloco disabled={busy || !/^9\d{8}$/.test(phone)} onClick={() => void start()}>{busy ? 'A iniciar…' : 'Iniciar pagamento'}</Botao> : phase === 'falhado' || phase === 'expirado' ? <Botao bloco onClick={retryTerminal}>Tentar outra vez</Botao> : <Botao bloco variante="secundario" disabled={busy} onClick={() => void (intent ? check() : start())}>Verificar pagamento</Botao>}
    <p className="mt-2 text-center text-[11px] font-bold text-dim">Só a confirmação recebida pelo servidor altera o estado do pedido.</p>
  </>}>
    <Painel><Rotulo>Estás a comprar</Rotulo><h2 className="mt-2 text-lg font-black">{deal.offer.title}</h2><p className="text-xs font-bold text-dim">Prazo de entrega: {deal.offer.slaHours} horas após aceitação.</p><MoneyBreakdown price={deal.price} buyerFee={deal.buyerFee} amount={deal.amount} /></Painel>
    <AvisoRetencao />
    {phase === 'confirmar' && payable ? <label className="mt-4 block text-sm font-black">Número associado ao Express<div className="mt-2 flex items-center gap-3 rounded-full border border-line bg-wash px-4 py-3"><span>+244</span><input aria-label="Número Express" type="tel" inputMode="tel" autoComplete="tel-national" value={phone} onChange={event => setPhone(event.target.value.replace(/\D/g,'').slice(0,9))} placeholder="923 000 000" className="min-w-0 flex-1 bg-transparent py-1 text-base" /></div></label> : null}
    {phase !== 'confirmar' ? <section role="status" aria-live="polite" className="mt-3 flex flex-col items-center rounded-[24px] border border-line bg-surface p-6 text-center">
      {phase === 'aguardar' ? <FlorAGirar className="size-14" /> : <Flor className="size-14" fill={phase === 'confirmado' ? 'var(--color-lime)' : 'var(--color-danger)'} />}
      <h2 className="mt-4 text-lg font-black">{TITLES[phase]}</h2>
      <p className="mt-2 text-[13px] font-bold leading-relaxed text-dim">{phase === 'confirmado' ? 'O servidor confirmou o pagamento. Podes acompanhar o pedido na conversa.' : phase === 'falhado' || phase === 'expirado' ? 'O servidor não confirmou uma cobrança nesta tentativa.' : 'Podes sair e voltar. Vamos consultar o mesmo pagamento, sem o duplicar.'}</p>
      {intent?.reference ? <p className="mt-3 break-all text-xs text-dim">Referência: {intent.reference}</p> : null}
    </section> : null}
    {error ? <p role="alert" className="mt-4 rounded-[18px] border border-danger p-3 text-sm text-danger">{error}</p> : null}
    {intent?.provider === 'fake' && phase === 'aguardar' ? <Painel className="mt-4"><Rotulo>Simulador local</Rotulo><p className="my-3 text-xs leading-relaxed text-dim">Não há ligação ao banco e não sai dinheiro real. Este botão envia uma confirmação de teste ao servidor.</p><Botao bloco variante="secundario" disabled={busy} onClick={() => void simulate()}>Confirmar pagamento de teste</Botao></Painel> : null}
  </Screen>;
}
