import { beforeEach, describe, expect, it } from 'vitest';
import { Clock } from '@/core/clock/clock';
import { ResourceNotFoundError } from '@/core/errors/domain-error';
import { GetWalletUseCase } from '@/modules/ledger/application/use-cases/get-wallet.use-case';
import { Money } from '@/shared/domain/money';
import { makeJourney } from '@/shared/testing/deal-journey';
import { makeTestContext, type TestContext } from '@/shared/testing/test-context';
import {
  BelowMinimumPayoutError,
  IdentityNotVerifiedError,
  InsufficientBalanceError,
  InvalidPayoutTransitionError,
  maskDestination,
} from '../../domain/payout';
import { ListMyPayoutsUseCase, ListPayoutQueueUseCase } from './list-payouts.use-case';
import { AdminPayoutUseCase, CancelPayoutUseCase } from './manage-payout.use-case';
import { PayoutLedgerService, reserveReference } from './payout-ledger';
import { RequestPayoutUseCase } from './request-payout.use-case';

/** O criador ganha 47 500,00 Kz por cada pedido concluído de 50 000,00. */
const LIQUIDO_POR_PEDIDO = 4_750_000n;

describe('levantamentos (F5)', () => {
  let ctx: TestContext;
  let journey: ReturnType<typeof makeJourney>;
  let requestPayout: RequestPayoutUseCase;
  let cancelPayout: CancelPayoutUseCase;
  let admin: AdminPayoutUseCase;
  let listMine: ListMyPayoutsUseCase;
  let queue: ListPayoutQueueUseCase;
  let getWallet: GetWalletUseCase;

  beforeEach(async () => {
    ctx = makeTestContext();
    journey = makeJourney(ctx);

    const payoutLedger = new PayoutLedgerService(ctx.ledger, ctx.ids);

    requestPayout = new RequestPayoutUseCase(
      ctx.transactions,
      ctx.payouts,
      ctx.profiles,
      ctx.users,
      ctx.ledger,
      ctx.wallets,
      payoutLedger,
      ctx.outbox,
      ctx.auditLog,
      ctx.ids,
      ctx.pricing,
      ctx.clock,
    );

    cancelPayout = new CancelPayoutUseCase(
      ctx.transactions,
      ctx.payouts,
      ctx.profiles,
      ctx.wallets,
      payoutLedger,
      ctx.outbox,
      ctx.auditLog,
      ctx.clock,
    );

    admin = new AdminPayoutUseCase(
      ctx.transactions,
      ctx.payouts,
      ctx.wallets,
      payoutLedger,
      ctx.outbox,
      ctx.auditLog,
      ctx.clock,
    );

    listMine = new ListMyPayoutsUseCase(ctx.payouts, ctx.profiles);
    queue = new ListPayoutQueueUseCase(ctx.payouts);
    getWallet = new GetWalletUseCase(
      ctx.transactions,
      ctx.profiles,
      ctx.wallets,
      ctx.ledger,
      ctx.clock as Clock,
    );

    ctx.seedUser({ id: 'buyer' });
    ctx.seedUser({ id: 'outro-buyer' });
    ctx.seedCreator({ id: 'creator', handle: 'nelsonbeats' });
    ctx.seedCreator({ id: 'outro-creator', handle: 'outra' });
    ctx.seedOffer({ id: 'offer-1', profileId: 'profile-creator' });
  });

  /** Leva um pedido até ao fim para o criador ter saldo a sério no razão. */
  async function ganharSaldo(buyerUserId = 'buyer'): Promise<void> {
    await journey.advanceTo('PAID', { buyerUserId });
  }

  function verificarIdentidade(userId = 'creator'): void {
    const user = ctx.db.users.get(userId)!;
    ctx.db.users.set(userId, { ...user, verificationLevel: 'IDENTITY' });
  }

  const pedir = (amountMinor: bigint, actorUserId = 'creator') =>
    requestPayout.execute({
      actorUserId,
      amountMinor: amountMinor.toString(),
      method: 'BANK_TRANSFER',
      destination: 'AO06004000006982246210102',
    });

  describe('pedir (RN-050, RN-051, RN-052, RN-054)', () => {
    it('reserva o valor no instante do pedido', async () => {
      await ganharSaldo();
      verificarIdentidade();

      const payout = await pedir(1_000_000n);

      expect(payout.status).toBe('REQUESTED');

      const carteira = await getWallet.execute({ actorUserId: 'creator' });
      expect(carteira.wallet.available.amountMinor).toBe(LIQUIDO_POR_PEDIDO - 1_000_000n);
      expect(carteira.wallet.reserved.amountMinor).toBe(1_000_000n);
    });

    it('o lançamento da reserva soma zero (RN-100)', async () => {
      await ganharSaldo();
      verificarIdentidade();

      const payout = await pedir(1_000_000n);

      const reserva = ctx.db.ledger.find((t) => t.kind === 'PAYOUT_RESERVE')!;
      const soma = reserva.entries.reduce(
        (total, entrada) => total.add(entrada.signedAmount),
        Money.zero(),
      );

      expect(soma.isZero).toBe(true);
      expect(
        await ctx.ledger.existsByExternalReference('PAYOUT_RESERVE', reserveReference(payout.id)),
      ).toBe(true);
    });

    it('recusa sem identidade verificada — 403 e não 404 (RN-051)', async () => {
      await ganharSaldo();

      await expect(pedir(1_000_000n)).rejects.toThrow(IdentityNotVerifiedError);
      expect(ctx.db.ledger.some((t) => t.kind === 'PAYOUT_RESERVE')).toBe(false);
    });

    it('recusa abaixo do mínimo configurado (RN-054)', async () => {
      await ganharSaldo();
      verificarIdentidade();

      // O mínimo semeado no contexto de teste é 5 000,00 Kz.
      await expect(pedir(100_000n)).rejects.toThrow(BelowMinimumPayoutError);
    });

    it('recusa mais do que o disponível (RN-050)', async () => {
      await ganharSaldo();
      verificarIdentidade();

      await expect(pedir(LIQUIDO_POR_PEDIDO + 1n)).rejects.toThrow(InsufficientBalanceError);
    });

    it('o saldo vem do razão, não da projecção — mesmo com a carteira corrompida', async () => {
      await ganharSaldo();
      verificarIdentidade();

      // Corrompe a projecção de propósito: um saldo inflacionado não pode
      // autorizar um levantamento que o razão não suporta (RN-050, RN-103).
      ctx.wallets.recomputeFromLedger = async (profileId, recomputedAt) => ({
        profileId,
        available: Money.fromMinor(999_999_999n),
        reserved: Money.zero(),
        pending: Money.zero(),
        recomputedAt,
      });

      await expect(pedir(LIQUIDO_POR_PEDIDO + 1n)).rejects.toThrow(InsufficientBalanceError);
    });

    it('dois pedidos seguidos do saldo total: o segundo já não tem saldo', async () => {
      await ganharSaldo();
      verificarIdentidade();

      await pedir(LIQUIDO_POR_PEDIDO);

      await expect(pedir(LIQUIDO_POR_PEDIDO)).rejects.toThrow(InsufficientBalanceError);
    });

    it('o destino nunca é guardado em claro na auditoria', async () => {
      await ganharSaldo();
      verificarIdentidade();

      await pedir(1_000_000n);

      const registo = ctx.db.auditLog.find((e) => e.action === 'payout.requested')!;
      expect(JSON.stringify(registo.metadata)).not.toContain('AO06004000006982246210102');
    });

    it('mascara o destino, deixando só os últimos dígitos', () => {
      expect(maskDestination('AO06004000006982246210102')).toBe('••••0102');
    });

    it('um utilizador sem perfil de criador não tem nada a levantar', async () => {
      await expect(pedir(1_000_000n, 'buyer')).rejects.toThrow(ResourceNotFoundError);
    });
  });

  describe('cancelar', () => {
    it('devolve o valor a disponível, por estorno e não por alteração (RN-101)', async () => {
      await ganharSaldo();
      verificarIdentidade();

      const payout = await pedir(1_000_000n);
      await cancelPayout.execute({ actorUserId: 'creator', payoutId: payout.id });

      const carteira = await getWallet.execute({ actorUserId: 'creator' });
      expect(carteira.wallet.available.amountMinor).toBe(LIQUIDO_POR_PEDIDO);
      expect(carteira.wallet.reserved.isZero).toBe(true);

      // A reserva continua lá; ao lado dela está o estorno que a desfez.
      expect(ctx.db.ledger.filter((t) => t.kind === 'PAYOUT_RESERVE')).toHaveLength(1);
      expect(ctx.db.ledger.filter((t) => t.kind === 'PAYOUT_REVERSE')).toHaveLength(1);
    });

    it('não cancela depois de a administração aprovar', async () => {
      await ganharSaldo();
      verificarIdentidade();

      const payout = await pedir(1_000_000n);
      await admin.approve({ reviewerUserId: 'admin', payoutId: payout.id });

      await expect(
        cancelPayout.execute({ actorUserId: 'creator', payoutId: payout.id }),
      ).rejects.toThrow(InvalidPayoutTransitionError);
    });

    it('um criador não cancela o levantamento de outro — 404 (RN-063)', async () => {
      await ganharSaldo();
      verificarIdentidade();

      const payout = await pedir(1_000_000n);

      await expect(
        cancelPayout.execute({ actorUserId: 'outro-creator', payoutId: payout.id }),
      ).rejects.toThrow(ResourceNotFoundError);
    });
  });

  describe('o percurso da administração', () => {
    it('aprovar, enviar e confirmar tira o dinheiro da plataforma', async () => {
      await ganharSaldo();
      verificarIdentidade();

      const payout = await pedir(1_000_000n);

      await admin.approve({ reviewerUserId: 'admin', payoutId: payout.id });
      await admin.markProcessing({
        reviewerUserId: 'admin',
        payoutId: payout.id,
        providerReference: 'TRF-001',
      });
      const pago = await admin.settle({ reviewerUserId: 'admin', payoutId: payout.id });

      expect(pago.status).toBe('PAID');

      const carteira = await getWallet.execute({ actorUserId: 'creator' });
      expect(carteira.wallet.available.amountMinor).toBe(LIQUIDO_POR_PEDIDO - 1_000_000n);
      expect(carteira.wallet.reserved.isZero).toBe(true);
    });

    it('a liquidação soma zero e fecha a reserva contra o parceiro', async () => {
      await ganharSaldo();
      verificarIdentidade();

      const payout = await pedir(1_000_000n);
      await admin.approve({ reviewerUserId: 'admin', payoutId: payout.id });
      await admin.markProcessing({
        reviewerUserId: 'admin',
        payoutId: payout.id,
        providerReference: 'TRF-001',
      });
      await admin.settle({ reviewerUserId: 'admin', payoutId: payout.id });

      const liquidacao = ctx.db.ledger.find((t) => t.kind === 'PAYOUT_SETTLE')!;

      expect(
        liquidacao.entries.map((e) => [e.account, e.direction, e.amount.amountMinor]),
      ).toEqual([
        ['CREATOR_RESERVED', 'DEBIT', 1_000_000n],
        ['PROVIDER_CLEARING', 'CREDIT', 1_000_000n],
      ]);
    });

    it('falhar devolve o valor a disponível e deixa pedir outra vez', async () => {
      await ganharSaldo();
      verificarIdentidade();

      const payout = await pedir(1_000_000n);
      await admin.approve({ reviewerUserId: 'admin', payoutId: payout.id });
      await admin.fail({
        reviewerUserId: 'admin',
        payoutId: payout.id,
        reason: 'IBAN recusado pelo banco.',
      });

      const carteira = await getWallet.execute({ actorUserId: 'creator' });
      expect(carteira.wallet.available.amountMinor).toBe(LIQUIDO_POR_PEDIDO);

      // E o criador volta a poder pedir o mesmo valor.
      await expect(pedir(1_000_000n)).resolves.toBeDefined();
    });

    it('não confirma um levantamento que nunca foi enviado', async () => {
      await ganharSaldo();
      verificarIdentidade();

      const payout = await pedir(1_000_000n);

      await expect(
        admin.settle({ reviewerUserId: 'admin', payoutId: payout.id }),
      ).rejects.toThrow(InvalidPayoutTransitionError);
    });

    it('um levantamento pago já não falha nem estorna', async () => {
      await ganharSaldo();
      verificarIdentidade();

      const payout = await pedir(1_000_000n);
      await admin.approve({ reviewerUserId: 'admin', payoutId: payout.id });
      await admin.markProcessing({
        reviewerUserId: 'admin',
        payoutId: payout.id,
        providerReference: 'TRF-001',
      });
      await admin.settle({ reviewerUserId: 'admin', payoutId: payout.id });

      await expect(
        admin.fail({ reviewerUserId: 'admin', payoutId: payout.id, reason: 'tarde demais' }),
      ).rejects.toThrow(InvalidPayoutTransitionError);

      expect(ctx.db.ledger.filter((t) => t.kind === 'PAYOUT_REVERSE')).toHaveLength(0);
    });

    it('a auditoria regista quem decidiu', async () => {
      await ganharSaldo();
      verificarIdentidade();

      const payout = await pedir(1_000_000n);
      await admin.approve({ reviewerUserId: 'admin', payoutId: payout.id });

      const registo = ctx.db.auditLog.find((e) => e.action === 'payout.approved')!;
      expect(registo.actorUserId).toBe('admin');
      expect(registo.subjectId).toBe(payout.id);
    });
  });

  describe('listagens', () => {
    it('o criador vê os seus e só os seus', async () => {
      await ganharSaldo();
      verificarIdentidade();
      await pedir(1_000_000n);

      const meus = await listMine.execute({ actorUserId: 'creator' });
      const doOutro = await listMine.execute({ actorUserId: 'outro-creator' });

      expect(meus).toHaveLength(1);
      expect(doOutro).toHaveLength(0);
    });

    it('a fila da administração mostra os que esperam decisão', async () => {
      await ganharSaldo();
      verificarIdentidade();
      await pedir(1_000_000n);

      expect(await queue.execute({})).toHaveLength(1);
      expect(await queue.execute({ status: 'PAID' })).toHaveLength(0);
    });
  });
});
