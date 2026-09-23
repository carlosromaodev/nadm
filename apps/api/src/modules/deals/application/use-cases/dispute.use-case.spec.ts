import { beforeEach, describe, expect, it } from 'vitest';
import { ResourceNotFoundError } from '@/core/errors/domain-error';
import { Money } from '@/shared/domain/money';
import { makeJourney } from '@/shared/testing/deal-journey';
import { makeTestContext, type TestContext } from '@/shared/testing/test-context';
import {
  DisputeAlreadyOpenError,
  DisputeBlocksReleaseError,
  DisputeNotOpenError,
  DisputeReasonRequiredError,
  NoOpenDisputeError,
} from '../../domain/dispute';
import { DealNotFoundError, InvalidDealTransitionError } from '../../domain/errors';
import { STATE_CHANGE_BODY } from '../../domain/message';

const MOTIVO = 'O vídeo não tem nada a ver com o que pedi.';

describe('disputas (F6)', () => {
  let ctx: TestContext;
  let journey: ReturnType<typeof makeJourney>;

  beforeEach(() => {
    ctx = makeTestContext();
    journey = makeJourney(ctx);

    ctx.seedUser({ id: 'buyer' });
    ctx.seedUser({ id: 'estranho' });
    ctx.seedUser({ id: 'admin' });
    ctx.seedCreator({ id: 'creator', handle: 'nelsonbeats' });
    ctx.seedOffer({ id: 'offer-1', profileId: 'profile-creator' });
  });

  const abrir = (dealId: string, actorUserId = 'buyer') =>
    journey.openDispute.execute({ actorUserId, dealId, reason: MOTIVO });

  describe('abrir', () => {
    it('qualquer uma das partes pode abrir', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      const { dispute } = await abrir(entregue.id, 'creator');

      expect(dispute.status).toBe('OPEN');
      expect(dispute.openedByUserId).toBe('creator');
    });

    it('abrir não mexe em dinheiro nenhum', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      await abrir(entregue.id);

      const deal = await ctx.deals.findById(entregue.id);
      expect(deal?.escrowStatus).toBe('HELD');
      expect(ctx.db.ledger.map((t) => t.kind)).toEqual(['ESCROW_FUNDING']);
    });

    it('escreve o motivo e a mudança de estado na conversa (RN-049)', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      await abrir(entregue.id);

      const conversa = await ctx.messages.listByDeal(entregue.id, 50);
      expect(conversa.some((m) => m.kind === 'TEXT' && m.body === MOTIVO)).toBe(true);
      expect(conversa.some((m) => m.body === STATE_CHANGE_BODY.DISPUTE_OPENED)).toBe(true);
    });

    it('exige motivo', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      await expect(
        journey.openDispute.execute({ actorUserId: 'buyer', dealId: entregue.id, reason: '  ' }),
      ).rejects.toThrow(DisputeReasonRequiredError);
    });

    it('uma segunda disputa no mesmo pedido devolve 409', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      await abrir(entregue.id);

      await expect(abrir(entregue.id, 'creator')).rejects.toThrow(DisputeAlreadyOpenError);
    });

    it('não se disputa um pedido por decidir nem um já concluído', async () => {
      const proposto = await journey.advanceTo('PAGO');
      await expect(abrir(proposto.id)).rejects.toThrow(InvalidDealTransitionError);

      const pago = await journey.advanceTo('PAID');
      await expect(abrir(pago.id)).rejects.toThrow(InvalidDealTransitionError);
    });

    it('um terceiro não encontra o pedido (RN-063)', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      await expect(abrir(entregue.id, 'estranho')).rejects.toThrow(DealNotFoundError);
    });
  });

  describe('RN-048 · a disputa trava a libertação', () => {
    it('aprovar com disputa aberta não liberta o escrow', async () => {
      const entregue = await journey.advanceTo('DELIVERED');
      await abrir(entregue.id);

      await expect(
        journey.approveDelivery.execute({ actorUserId: 'buyer', dealId: entregue.id }),
      ).rejects.toThrow(DisputeBlocksReleaseError);

      const deal = await ctx.deals.findById(entregue.id);
      expect(deal?.status).toBe('DELIVERED');
      expect(deal?.escrowStatus).toBe('HELD');
      expect(ctx.db.ledger.some((t) => t.kind === 'ESCROW_RELEASE')).toBe(false);
    });

    it('a aprovação automática também fica travada', async () => {
      const entregue = await journey.advanceTo('DELIVERED');
      await abrir(entregue.id);

      ctx.clock.advanceHours(72);

      const resultado = await journey.runDeadlines.execute();

      expect(resultado.autoApproved).toBe(0);
      expect(resultado.failed).toBe(1);
      expect((await ctx.deals.findById(entregue.id))?.status).toBe('DELIVERED');
    });

    it('retirada a disputa, a aprovação volta a libertar', async () => {
      const entregue = await journey.advanceTo('DELIVERED');
      await abrir(entregue.id);

      await journey.withdrawDispute.execute({ actorUserId: 'buyer', dealId: entregue.id });

      const deal = await journey.approveDelivery.execute({
        actorUserId: 'buyer',
        dealId: entregue.id,
      });

      expect(deal.status).toBe('PAID');
    });
  });

  describe('retirar', () => {
    it('só quem a abriu é que a retira', async () => {
      const entregue = await journey.advanceTo('DELIVERED');
      await abrir(entregue.id, 'buyer');

      await expect(
        journey.withdrawDispute.execute({ actorUserId: 'creator', dealId: entregue.id }),
      ).rejects.toThrow(NoOpenDisputeError);
    });

    it('sem disputa aberta não há nada para retirar', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      await expect(
        journey.withdrawDispute.execute({ actorUserId: 'buyer', dealId: entregue.id }),
      ).rejects.toThrow(NoOpenDisputeError);
    });
  });

  describe('T15 · a administração decide a favor do comprador', () => {
    it('devolve o dinheiro e fecha o negócio', async () => {
      const entregue = await journey.advanceTo('DELIVERED');
      const { dispute } = await abrir(entregue.id);

      const { deal } = await journey.resolveDispute.execute({
        reviewerUserId: 'admin',
        disputeId: dispute.id,
        resolution: 'BUYER',
        note: 'A entrega não corresponde ao briefing.',
      });

      expect(deal.status).toBe('REFUNDED');
      expect(deal.escrowStatus).toBe('REFUNDED');
    });

    it('o estorno soma zero e deixa o escrow do pedido a zero (RN-100)', async () => {
      const entregue = await journey.advanceTo('DELIVERED');
      const { dispute } = await abrir(entregue.id);

      await journey.resolveDispute.execute({
        reviewerUserId: 'admin',
        disputeId: dispute.id,
        resolution: 'BUYER',
      });

      const estorno = ctx.db.ledger.find((t) => t.kind === 'ESCROW_REFUND')!;
      const soma = estorno.entries.reduce(
        (total, entrada) => total.add(entrada.signedAmount),
        Money.zero(),
      );

      expect(soma.isZero).toBe(true);
      expect((await ctx.ledger.balanceOf('ESCROW', entregue.id)).isZero).toBe(true);
    });

    it('o criador não recebe nada', async () => {
      const entregue = await journey.advanceTo('DELIVERED');
      const { dispute } = await abrir(entregue.id);

      await journey.resolveDispute.execute({
        reviewerUserId: 'admin',
        disputeId: dispute.id,
        resolution: 'BUYER',
      });

      const carteira = await ctx.wallets.findByProfile('profile-creator');
      expect(carteira?.available.isZero).toBe(true);
    });

    it('a decisão entra na conversa como SYSTEM, para as duas partes lerem', async () => {
      const entregue = await journey.advanceTo('DELIVERED');
      const { dispute } = await abrir(entregue.id);

      await journey.resolveDispute.execute({
        reviewerUserId: 'admin',
        disputeId: dispute.id,
        resolution: 'BUYER',
        note: 'A entrega não corresponde ao briefing.',
      });

      const conversa = await ctx.messages.listByDeal(entregue.id, 50);

      expect(conversa.some((m) => m.body === STATE_CHANGE_BODY.DISPUTE_RESOLVED_BUYER)).toBe(true);
      const nota = conversa.find((m) => m.body === 'A entrega não corresponde ao briefing.');
      expect(nota?.kind).toBe('SYSTEM');
      expect(nota?.senderUserId).toBeNull();
    });
  });

  describe('T15 · a administração decide a favor do criador', () => {
    it('não move dinheiro nenhum, e desbloqueia a libertação', async () => {
      const entregue = await journey.advanceTo('DELIVERED');
      const { dispute } = await abrir(entregue.id);

      const { deal } = await journey.resolveDispute.execute({
        reviewerUserId: 'admin',
        disputeId: dispute.id,
        resolution: 'CREATOR',
      });

      expect(deal.status).toBe('DELIVERED');
      expect(ctx.db.ledger.some((t) => t.kind === 'ESCROW_REFUND')).toBe(false);

      const pago = await journey.approveDelivery.execute({
        actorUserId: 'buyer',
        dealId: entregue.id,
      });

      expect(pago.status).toBe('PAID');
    });

    it('uma disputa já decidida não se decide outra vez', async () => {
      const entregue = await journey.advanceTo('DELIVERED');
      const { dispute } = await abrir(entregue.id);

      await journey.resolveDispute.execute({
        reviewerUserId: 'admin',
        disputeId: dispute.id,
        resolution: 'CREATOR',
      });

      await expect(
        journey.resolveDispute.execute({
          reviewerUserId: 'admin',
          disputeId: dispute.id,
          resolution: 'BUYER',
        }),
      ).rejects.toThrow(DisputeNotOpenError);
    });

    it('decidir uma disputa que não existe é 404', async () => {
      await expect(
        journey.resolveDispute.execute({
          reviewerUserId: 'admin',
          disputeId: 'nao-existe',
          resolution: 'BUYER',
        }),
      ).rejects.toThrow(ResourceNotFoundError);
    });

    it('a auditoria diz quem decidiu, a favor de quem e se houve devolução', async () => {
      const entregue = await journey.advanceTo('DELIVERED');
      const { dispute } = await abrir(entregue.id);

      await journey.resolveDispute.execute({
        reviewerUserId: 'admin',
        disputeId: dispute.id,
        resolution: 'BUYER',
      });

      const registo = ctx.db.auditLog.find((e) => e.action === 'dispute.resolved')!;
      expect(registo.actorUserId).toBe('admin');
      expect(registo.metadata).toMatchObject({ resolution: 'BUYER', refunded: true });
    });
  });

  describe('RN-064 · a administração na conversa', () => {
    it('lê a conversa quando há disputa aberta, e fica registado', async () => {
      const entregue = await journey.advanceTo('DELIVERED');
      await abrir(entregue.id);

      const conversa = await journey.adminReadConversation.execute({
        adminUserId: 'admin',
        dealId: entregue.id,
      });

      expect(conversa.messages.length).toBeGreaterThan(0);

      const registo = ctx.db.auditLog.find((e) => e.action === 'admin.conversation_read')!;
      expect(registo.actorUserId).toBe('admin');
      expect(registo.subjectId).toBe(entregue.id);
    });

    it('sem disputa aberta não lê nada', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      await expect(
        journey.adminReadConversation.execute({ adminUserId: 'admin', dealId: entregue.id }),
      ).rejects.toThrow(NoOpenDisputeError);

      expect(ctx.db.auditLog.some((e) => e.action === 'admin.conversation_read')).toBe(false);
    });

    it('as mensagens da administração são SYSTEM e sem autor pessoal', async () => {
      const entregue = await journey.advanceTo('DELIVERED');
      await abrir(entregue.id);

      const mensagem = await journey.adminPostMessage.execute({
        adminUserId: 'admin',
        dealId: entregue.id,
        body: 'Vamos analisar e responder em 48 horas.',
      });

      expect(mensagem.kind).toBe('SYSTEM');
      expect(mensagem.senderUserId).toBeNull();

      const registo = ctx.db.auditLog.find((e) => e.action === 'admin.conversation_message')!;
      expect(registo.actorUserId).toBe('admin');
    });

    it('sem disputa aberta não escreve na conversa', async () => {
      const entregue = await journey.advanceTo('DELIVERED');

      await expect(
        journey.adminPostMessage.execute({
          adminUserId: 'admin',
          dealId: entregue.id,
          body: 'Olá.',
        }),
      ).rejects.toThrow(NoOpenDisputeError);
    });
  });

  describe('a fila da administração', () => {
    it('mostra as abertas e deixa de mostrar as decididas', async () => {
      const entregue = await journey.advanceTo('DELIVERED');
      const { dispute } = await abrir(entregue.id);

      expect(await journey.listOpenDisputes.execute()).toHaveLength(1);

      await journey.resolveDispute.execute({
        reviewerUserId: 'admin',
        disputeId: dispute.id,
        resolution: 'CREATOR',
      });

      expect(await journey.listOpenDisputes.execute()).toHaveLength(0);
    });
  });
});
