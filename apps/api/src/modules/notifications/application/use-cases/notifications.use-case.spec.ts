import { beforeEach, describe, expect, it } from 'vitest';
import { makeJourney } from '@/shared/testing/deal-journey';
import { makeTestContext, type TestContext } from '@/shared/testing/test-context';
import { FakeNotificationChannel } from '../../infra/fake-notification.channel';
import {
  deliverableAt,
  isQuietHour,
  luandaHour,
  notificationKey,
} from '../../domain/notification';
import { DispatchOutboxUseCase } from './dispatch-outbox.use-case';
import { NotificationPlanner } from './notification-planner';

/** As 20h de Luanda são as 19h UTC — Luanda é UTC+1 o ano inteiro. */
const NOITE = new Date('2026-09-22T22:30:00.000Z'); // 23h30 em Luanda
const DIA = new Date('2026-09-22T09:00:00.000Z'); // 10h em Luanda

describe('notificações (F9, a metade que não depende de DP-03)', () => {
  let ctx: TestContext;
  let journey: ReturnType<typeof makeJourney>;
  let canal: FakeNotificationChannel;
  let despachar: DispatchOutboxUseCase;

  beforeEach(() => {
    ctx = makeTestContext();
    journey = makeJourney(ctx);
    canal = new FakeNotificationChannel(ctx.clock);

    despachar = new DispatchOutboxUseCase(
      ctx.transactions,
      ctx.outboxQueue,
      ctx.notifications,
      new NotificationPlanner(ctx.deals, ctx.profiles),
      canal,
      ctx.users,
      ctx.ids,
      ctx.clock,
    );

    ctx.seedUser({ id: 'buyer' });
    ctx.seedCreator({ id: 'creator', handle: 'nelsonbeats' });
    ctx.seedOffer({ id: 'offer-1', profileId: 'profile-creator' });
  });

  const enviadasPara = (userId: string) =>
    canal.sent.filter((envio) => envio.to.userId === userId);

  describe('a matriz decide quem é avisado', () => {
    it('um pedido novo avisa o criador, e não o comprador', async () => {
      await journey.advanceTo('PROPOSED');

      await despachar.execute();

      expect(enviadasPara('creator').some((e) => e.template === 'deal.created')).toBe(true);
      expect(enviadasPara('buyer').some((e) => e.template === 'deal.created')).toBe(false);
    });

    it('aceitar avisa o comprador, e não o criador que aceitou', async () => {
      await journey.advanceTo('ACCEPTED');

      await despachar.execute();

      expect(enviadasPara('buyer').some((e) => e.template === 'deal.accepted')).toBe(true);
      expect(enviadasPara('creator').some((e) => e.template === 'deal.accepted')).toBe(false);
    });

    it('a captura avisa os dois: um recebe recibo, o outro fica a saber que pode decidir', async () => {
      await journey.advanceTo('PAGO');

      await despachar.execute();

      const captura = canal.sent.filter((e) => e.template === 'payment.captured');
      expect(new Set(captura.map((e) => e.to.userId))).toEqual(new Set(['buyer', 'creator']));
    });

    it('quem escreve uma mensagem não é avisado da sua própria mensagem', async () => {
      const deal = await journey.advanceTo('ACCEPTED');
      canal.clear();

      await ctx.outbox.enqueue({
        type: 'message.created',
        payload: { dealId: deal.id, senderUserId: 'buyer' },
        availableAt: ctx.clock.now(),
      });

      await despachar.execute();

      const mensagens = canal.sent.filter((e) => e.template === 'message.created');
      expect(mensagens.map((e) => e.to.userId)).toEqual(['creator']);
    });

    it('um evento fora da matriz não notifica ninguém', async () => {
      await ctx.outbox.enqueue({
        type: 'reconciliation.finding_detected',
        payload: { findingId: 'f-1' },
        availableAt: ctx.clock.now(),
      });

      const resultado = await despachar.execute();

      expect(resultado.sent).toBe(0);
      // Mas o evento fica tratado: não é para reaparecer todas as passagens.
      expect(resultado.processed).toBeGreaterThan(0);
    });
  });

  describe('o SMS custa dinheiro (SDD §14.3)', () => {
    it('um pedido novo pode sair por SMS', async () => {
      await journey.advanceTo('PROPOSED');

      await despachar.execute();

      expect(canal.sent.some((e) => e.kind === 'SMS')).toBe(true);
    });

    it('uma entrega submetida não sai por SMS, mesmo com o canal na matriz', async () => {
      await journey.advanceTo('DELIVERED');
      canal.clear();

      await ctx.outbox.enqueue({
        type: 'delivery.submitted',
        payload: { dealId: (await journey.advanceTo('DELIVERED')).id },
        availableAt: ctx.clock.now(),
      });

      await despachar.execute();

      const entregas = canal.sent.filter((e) => e.template === 'delivery.submitted');
      expect(entregas.length).toBeGreaterThan(0);
      expect(entregas.some((e) => e.kind === 'SMS')).toBe(false);
    });
  });

  describe('o silêncio nocturno é adiar, não descartar', () => {
    it('Luanda é UTC+1 o ano inteiro', () => {
      expect(luandaHour(new Date('2026-09-22T09:00:00.000Z'))).toBe(10);
      // E em Janeiro é igual: não há horário de Verão.
      expect(luandaHour(new Date('2026-01-15T09:00:00.000Z'))).toBe(10);
    });

    it('conhece a noite entre as 22h e as 7h', () => {
      expect(isQuietHour(NOITE)).toBe(true);
      expect(isQuietHour(DIA)).toBe(false);
    });

    it('adia para as 7h da manhã seguinte', () => {
      const saida = deliverableAt(NOITE, 'delivery.submitted');

      expect(luandaHour(saida)).toBe(7);
      expect(saida.getTime()).toBeGreaterThan(NOITE.getTime());
    });

    it('de madrugada, adia para as 7h do mesmo dia', () => {
      const madrugada = new Date('2026-09-22T02:00:00.000Z'); // 3h em Luanda
      const saida = deliverableAt(madrugada, 'delivery.submitted');

      expect(luandaHour(saida)).toBe(7);
      expect(saida.getUTCDate()).toBe(madrugada.getUTCDate());
    });

    it('dinheiro e disputa atravessam a noite', () => {
      expect(deliverableAt(NOITE, 'payment.captured')).toEqual(NOITE);
      expect(deliverableAt(NOITE, 'dispute.opened')).toEqual(NOITE);
    });

    it('de dia, sai já', () => {
      expect(deliverableAt(DIA, 'delivery.submitted')).toEqual(DIA);
    });

    it('o trabalhador adia em vez de enviar, e conta-o', async () => {
      const deal = await journey.advanceTo('DELIVERED');
      canal.clear();

      await ctx.outbox.enqueue({
        type: 'delivery.submitted',
        payload: { dealId: deal.id },
        availableAt: NOITE,
      });

      // Passa a ser noite.
      ctx.clock.advanceMs(NOITE.getTime() - ctx.clock.now().getTime());

      const resultado = await despachar.execute();

      expect(resultado.deferred).toBeGreaterThan(0);
      expect(canal.sent.some((e) => e.template === 'delivery.submitted')).toBe(false);
    });
  });

  describe('idempotência (SDD §14.3)', () => {
    it('a chave deriva do evento, do destinatário e do canal', () => {
      expect(notificationKey('evt-1', 'u-1', 'PUSH')).toBe('evt-1:u-1:PUSH');
    });

    it('duas passagens do trabalhador enviam uma vez', async () => {
      await journey.advanceTo('PROPOSED');

      await despachar.execute();
      const antes = canal.sent.length;

      // Força o evento a voltar à fila, como se a marca não tivesse sido
      // gravada: é o caso que a chave única existe para travar.
      for (const evento of ctx.db.outbox) evento.processedAt = null;

      const segunda = await despachar.execute();

      expect(segunda.sent).toBe(0);
      expect(canal.sent).toHaveLength(antes);
    });
  });

  describe('falhas', () => {
    it('um envio falhado é tentado outra vez, com recuo', async () => {
      await journey.advanceTo('PROPOSED');
      canal.failNextSend();

      const resultado = await despachar.execute();

      expect(resultado.failed).toBe(1);

      const [evento] = ctx.db.outbox;
      expect(evento.attempts).toBe(1);
      expect(evento.processedAt).toBeNull();
      expect(evento.availableAt.getTime()).toBeGreaterThan(ctx.clock.now().getTime());
      expect(evento.lastError).toContain('falha simulada');
    });

    it('uma conta suspensa não é notificada', async () => {
      await journey.advanceTo('PROPOSED');

      const criador = ctx.db.users.get('creator')!;
      ctx.db.users.set('creator', { ...criador, status: 'SUSPENDED' });

      await despachar.execute();

      expect(enviadasPara('creator')).toHaveLength(0);
    });
  });

  describe('a transacção revertida não notifica ninguém', () => {
    it('porque o evento nunca chega a existir', async () => {
      // O outbox é escrito **dentro** da transacção que muda o estado. Uma
      // criação que falha não deixa evento nenhum para o trabalhador encontrar.
      await expect(
        journey.createDeal.execute({
          actorUserId: 'buyer',
          offerId: 'nao-existe',
          brief: 'Isto vai falhar.',
        }),
      ).rejects.toThrow();

      const resultado = await despachar.execute();

      expect(ctx.db.outbox).toHaveLength(0);
      expect(resultado.sent).toBe(0);
    });
  });
});
