import { beforeEach, describe, expect, it } from 'vitest';
import { ResourceConflictError } from '@/core/errors/domain-error';
import { LedgerTransaction } from '@/modules/ledger/domain/ledger-transaction';
import { Money } from '@/shared/domain/money';
import { makeJourney } from '@/shared/testing/deal-journey';
import { makeTestContext, type TestContext } from '@/shared/testing/test-context';
import { Deal } from '../../domain/deal';
import {
  DealNotFoundError,
  InvalidDealTransitionError,
  NotDealBuyerError,
} from '../../domain/errors';
import { releaseReference } from './escrow-release';

describe('ApproveDeliveryUseCase', () => {
  let ctx: TestContext;
  let journey: ReturnType<typeof makeJourney>;

  /**
   * Só os lançamentos da libertação. A captura já deixou o seu no razão (E1),
   * e contar o razão inteiro confundiria o dinheiro a entrar com o dinheiro a
   * sair.
   */
  const libertacoes = () => ctx.db.ledger.filter((t) => t.kind === 'ESCROW_RELEASE');

  beforeEach(() => {
    ctx = makeTestContext();
    journey = makeJourney(ctx);

    ctx.seedUser({ id: 'buyer' });
    ctx.seedCreator({ id: 'creator', handle: 'nelsonbeats' });
    ctx.seedOffer({ id: 'offer-1', profileId: 'profile-creator' });
  });

  describe('caminho normal', () => {
    it('recusa uma versão antiga sem aprovar nem movimentar dinheiro', async () => {
      const deal = await journey.advanceTo('DELIVERED');
      await expect(journey.approveDelivery.execute({ actorUserId: 'buyer', dealId: deal.id, expectedVersion: 2 })).rejects.toThrow(ResourceConflictError);
      expect((await ctx.deals.findById(deal.id))?.status).toBe('DELIVERED');
      expect(libertacoes()).toHaveLength(0);
      await journey.approveDelivery.execute({ actorUserId: 'buyer', dealId: deal.id, expectedVersion: 1 });
      await journey.approveDelivery.execute({ actorUserId: 'buyer', dealId: deal.id, expectedVersion: 1 });
      expect(libertacoes()).toHaveLength(1);
    });
    it('aprova a entrega e fecha o negócio em PAID', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      const deal = await journey.approveDelivery.execute({
        actorUserId: 'buyer',
        dealId: entregue.id,
      });

      expect(deal.status).toBe('PAID');
      expect(deal.escrowStatus).toBe('RELEASED');
    });

    it('lança no razão uma transacção cujas entradas somam zero (RN-100)', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      await journey.approveDelivery.execute({ actorUserId: 'buyer', dealId: entregue.id });

      const [transacao] = libertacoes();
      const soma = transacao.entries.reduce(
        (total, entrada) => total.add(entrada.signedAmount),
        Money.zero(),
      );

      expect(libertacoes()).toHaveLength(1);
      expect(soma.amountMinor).toBe(0n);
    });

    it('move o total cobrado, credita o preço ao criador e desconta-lhe a taxa', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      await journey.approveDelivery.execute({ actorUserId: 'buyer', dealId: entregue.id });

      const entradas = libertacoes()[0].entries.map((entrada) => [
        entrada.account,
        entrada.direction,
        entrada.amount.amountMinor,
      ]);

      // O criador é creditado pelo preço e debitado pela sua metade da taxa, em
      // linhas separadas: é o que a carteira mostra no design.
      expect(entradas).toEqual([
        ['ESCROW', 'DEBIT', 5_250_000n],
        ['CREATOR_AVAILABLE', 'CREDIT', 5_000_000n],
        ['CREATOR_AVAILABLE', 'DEBIT', 250_000n],
        ['PLATFORM_FEE_REVENUE', 'CREDIT', 500_000n],
      ]);
    });

    it('a plataforma fica com as duas metades da taxa', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      await journey.approveDelivery.execute({ actorUserId: 'buyer', dealId: entregue.id });

      const comissao = libertacoes()[0].entries.find(
        (entrada) => entrada.account === 'PLATFORM_FEE_REVENUE',
      );

      // 250 000 do comprador + 250 000 do criador.
      expect(comissao!.amount.amountMinor).toBe(500_000n);
    });

    it('o saldo do criador passa a ser exactamente o líquido do negócio', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      await journey.approveDelivery.execute({ actorUserId: 'buyer', dealId: entregue.id });

      const carteira = await ctx.wallets.recomputeFromLedger('profile-creator', ctx.clock.now());

      expect(carteira.available.amountMinor).toBe(4_750_000n);
    });

    it('marca a entrega como aceite', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      await journey.approveDelivery.execute({ actorUserId: 'buyer', dealId: entregue.id });

      const entrega = await ctx.deliveries.findLatest(entregue.id);

      expect(entrega!.acceptedAt).not.toBeNull();
    });

    it('escreve na conversa a aprovação e a libertação (RN-049)', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      await journey.approveDelivery.execute({ actorUserId: 'buyer', dealId: entregue.id });

      const corpos = (await ctx.messages.listByDeal(entregue.id, 50))
        .filter((mensagem) => mensagem.kind === 'STATE_CHANGE')
        .map((mensagem) => mensagem.body);

      expect(corpos).toContain('A entrega foi aprovada.');
      expect(corpos).toContain('O valor foi libertado para a carteira do criador.');
    });

    it('enfileira a notificação de dinheiro libertado', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      await journey.approveDelivery.execute({ actorUserId: 'buyer', dealId: entregue.id });

      expect(ctx.db.outbox.map((evento) => evento.type)).toContain('escrow.released');
    });

    it('escreve auditoria da libertação com os três valores', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      await journey.approveDelivery.execute({ actorUserId: 'buyer', dealId: entregue.id });

      expect(ctx.db.auditLog).toContainEqual(
        expect.objectContaining({
          action: 'escrow.released',
          actorKind: 'SYSTEM',
          metadata: {
            amountMinor: '5250000',
            creatorNetMinor: '4750000',
            platformFeeMinor: '500000',
          },
        }),
      );
    });
  });

  describe('idempotência (RN-104)', () => {
    it('aprovar duas vezes não duplica lançamentos', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      await journey.approveDelivery.execute({ actorUserId: 'buyer', dealId: entregue.id });
      const segunda = await journey.approveDelivery.execute({
        actorUserId: 'buyer',
        dealId: entregue.id,
      });

      expect(libertacoes()).toHaveLength(1);
      expect(segunda.status).toBe('PAID');
    });

    it('o saldo do criador não cresce na segunda tentativa', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      await journey.approveDelivery.execute({ actorUserId: 'buyer', dealId: entregue.id });
      await journey.approveDelivery.execute({ actorUserId: 'buyer', dealId: entregue.id });

      const carteira = await ctx.wallets.recomputeFromLedger('profile-creator', ctx.clock.now());

      expect(carteira.available.amountMinor).toBe(4_750_000n);
    });

    it('retoma a libertação quando a aprovação ficou gravada e o lançamento não', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      // Simula a falha a meio: o Deal ficou em APPROVED com o escrow retido.
      const interrompido = entregue.toProps();
      interrompido.status = 'APPROVED';
      interrompido.approvedAt = ctx.clock.now();
      ctx.db.deals.set(entregue.id, Deal.reconstitute(interrompido));

      const deal = await journey.approveDelivery.execute({
        actorUserId: 'buyer',
        dealId: entregue.id,
      });

      expect(deal.status).toBe('PAID');
      expect(libertacoes()).toHaveLength(1);
    });

    it('não lança de novo quando o razão já tem a chave semântica desta libertação', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      // Um lançamento anterior com a mesma chave, como se uma tarefa já o
      // tivesse feito antes de o estado do Deal ser gravado.
      await ctx.ledger.record(
        LedgerTransaction.create({
          id: 'tx-anterior',
          kind: 'ESCROW_RELEASE',
          externalReference: releaseReference(entregue.id),
          dealId: entregue.id,
          description: 'Lançamento de uma tentativa anterior',
          occurredAt: ctx.clock.now(),
          entries: [
            {
              account: 'ESCROW',
              subjectType: 'DEAL',
              subjectId: entregue.id,
              direction: 'DEBIT',
              amount: Money.fromMinor(5_250_000n),
            },
            {
              account: 'CREATOR_AVAILABLE',
              subjectType: 'PROFILE',
              subjectId: 'profile-creator',
              direction: 'CREDIT',
              amount: Money.fromMinor(5_250_000n),
            },
          ],
        }),
      );

      await journey.approveDelivery.execute({ actorUserId: 'buyer', dealId: entregue.id });

      expect(libertacoes()).toHaveLength(1);
      expect(libertacoes()[0].id).toBe('tx-anterior');
    });
  });

  describe('autorização', () => {
    it('um terceiro não encontra o pedido (RN-063)', async () => {
      const entregue = await journey.advanceTo('DELIVERED');
      ctx.seedUser({ id: 'estranho' });

      await expect(
        journey.approveDelivery.execute({ actorUserId: 'estranho', dealId: entregue.id }),
      ).rejects.toThrowError(DealNotFoundError);
    });

    it('o criador é parte, mas não é ele quem aprova — 403 e não 404', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      await expect(
        journey.approveDelivery.execute({ actorUserId: 'creator', dealId: entregue.id }),
      ).rejects.toThrowError(NotDealBuyerError);
    });

    it('nenhum dinheiro se move quando a autorização falha', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      await expect(
        journey.approveDelivery.execute({ actorUserId: 'creator', dealId: entregue.id }),
      ).rejects.toThrow();

      expect(libertacoes()).toHaveLength(0);
    });
  });

  describe('estado', () => {
    it('recusa aprovar um pedido que ainda não foi entregue', async () => {
      const emCurso = await journey.advanceTo('ACCEPTED');

      await expect(
        journey.approveDelivery.execute({ actorUserId: 'buyer', dealId: emCurso.id }),
      ).rejects.toThrowError(InvalidDealTransitionError);
    });

    it('recusa aprovar um pedido ainda por pagar', async () => {
      const aceite = await journey.advanceTo('ACCEPTED');

      await expect(
        journey.approveDelivery.execute({ actorUserId: 'buyer', dealId: aceite.id }),
      ).rejects.toThrowError(InvalidDealTransitionError);

      expect(libertacoes()).toHaveLength(0);
    });

    it('recusa aprovar um pedido que não existe', async () => {
      await expect(
        journey.approveDelivery.execute({ actorUserId: 'buyer', dealId: 'nao-existe' }),
      ).rejects.toThrowError(DealNotFoundError);
    });
  });
});
