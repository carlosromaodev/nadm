import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { NotificationChannel } from '@/modules/notifications/application/ports/notification-channel';
import type { FakeNotificationChannel } from '@/modules/notifications/infra/fake-notification.channel';
import { PaymentsGateway } from '@/modules/payments/application/ports/payments.gateway';
import type { FakePaymentsGateway } from '@/modules/payments/infra/fake-payments.gateway';
import { BUYER_ID, CREATOR_ID, seedFixtures } from './helpers/fixtures';
import {
  createTestApp,
  ownerPrisma,
  resetDatabase,
  type TestApp,
} from './helpers/test-app';

const ADMIN_ID = '77777777-7777-4777-8777-777777777777';

/**
 * A verificação do despacho de notificações contra Postgres real.
 *
 * O que aqui se prova é o que o SDD §14.3 promete: que o envio parte de
 * `outbox_events` escrito na mesma transacção que muda o estado, e que a mesma
 * notificação não sai duas vezes. **Os fornecedores continuam por decidir
 * (DP-03)** — o canal é o falso, e é quanto basta para provar isto.
 */
describe('F9 · despacho de notificações', () => {
  let harness: TestApp;
  let app: INestApplication;
  let prisma: PrismaClient;
  let gateway: FakePaymentsGateway;
  let canal: FakeNotificationChannel;
  let offerId: string;

  const as = (userId: string) => ({
    get: (url: string) => request(app.getHttpServer()).get(url).set('X-Dev-User', userId),
    post: (url: string) => request(app.getHttpServer()).post(url).set('X-Dev-User', userId),
  });

  const asAdmin = () => as(ADMIN_ID);
  const asBuyer = () => as(BUYER_ID);
  const asCreator = () => as(CREATOR_ID);

  beforeAll(async () => {
    harness = await createTestApp();
    app = harness.app;
    prisma = harness.prisma;
    gateway = app.get(PaymentsGateway) as FakePaymentsGateway;
    canal = app.get(NotificationChannel) as FakeNotificationChannel;
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await resetDatabase();
    offerId = (await seedFixtures(prisma)).offerId;
    canal.clear();

    await prisma.user.create({
      data: {
        id: ADMIN_ID,
        phone: '+244923777777',
        displayName: 'Administração',
        roles: ['ADMIN'],
        verificationLevel: 'PHONE',
        accounts: { create: { type: 'INDIVIDUAL' } },
      },
    });
  });

  const despachar = () => asAdmin().post('/api/admin/notifications/dispatch');

  async function criarPedido(): Promise<string> {
    const criado = await asBuyer()
      .post('/api/deals')
      .send({ offerId, brief: 'Parabéns para a minha irmã Ana.' })
      .expect(201);

    return criado.body.id as string;
  }

  async function pagar(dealId: string): Promise<void> {
    const pagamento = await asBuyer()
      .post(`/api/deals/${dealId}/payments`)
      .set('Idempotency-Key', `pay-${dealId}`)
      .send({ payerPhone: '+244923222222' })
      .expect(201);

    const intent = await prisma.paymentIntent.findUniqueOrThrow({
      where: { id: pagamento.body.intentId as string },
    });

    await request(app.getHttpServer())
      .post('/api/webhooks/payments/fake')
      .set('Content-Type', 'application/json')
      .send(gateway.captureAndBuildWebhook(intent.providerReference))
      .expect(201);
  }

  describe('o envio parte do outbox', () => {
    it('um pedido criado avisa o criador, e a fila fica limpa', async () => {
      await criarPedido();

      expect(await prisma.outboxEvent.count({ where: { processedAt: null } })).toBeGreaterThan(0);

      const { body } = await despachar().expect(200);

      expect(body.sent).toBeGreaterThan(0);
      expect(canal.sent.some((e) => e.template === 'deal.created')).toBe(true);
      expect(await prisma.outboxEvent.count({ where: { processedAt: null } })).toBe(0);
    });

    it('cada envio deixa uma linha, com a chave que o identifica', async () => {
      await criarPedido();
      await despachar().expect(200);

      const entregues = await prisma.notificationDelivery.findMany();

      expect(entregues.length).toBeGreaterThan(0);
      for (const entrega of entregues) {
        expect(entrega.idempotencyKey).toContain(entrega.recipientUserId);
        expect(entrega.provider).toBe('fake');
      }
    });

    it('o ciclo completo notifica cada lado do que lhe toca', async () => {
      const dealId = await criarPedido();
      await pagar(dealId);
      await asCreator().post(`/api/deals/${dealId}/accept`).expect(201);
      await asCreator()
        .post(`/api/deals/${dealId}/deliveries`)
        .send({ note: 'Entregue.' })
        .expect(201);
      await asBuyer().post(`/api/deals/${dealId}/deliveries/1/approve`).expect(200);

      await despachar().expect(200);

      const paraCriador = canal.sent
        .filter((e) => e.to.userId === CREATOR_ID)
        .map((e) => e.template);
      const paraComprador = canal.sent
        .filter((e) => e.to.userId === BUYER_ID)
        .map((e) => e.template);

      expect(paraCriador).toContain('deal.created');
      expect(paraCriador).toContain('escrow.released');
      expect(paraComprador).toContain('deal.accepted');
      expect(paraComprador).toContain('delivery.submitted');

      // E o criador não é avisado da aceitação que ele próprio fez.
      expect(paraCriador).not.toContain('deal.accepted');
    });
  });

  describe('idempotência', () => {
    it('duas passagens não enviam a mesma notificação duas vezes', async () => {
      await criarPedido();

      await despachar().expect(200);
      const primeiras = canal.sent.length;

      // Devolve os eventos à fila, como se a marca não tivesse sido gravada.
      await ownerPrisma().$executeRawUnsafe(`UPDATE outbox_events SET processed_at = NULL`);

      const { body } = await despachar().expect(200);

      expect(body.sent).toBe(0);
      expect(canal.sent).toHaveLength(primeiras);
    });

    it('a chave única é do Postgres, não de uma verificação em aplicação', async () => {
      await criarPedido();
      await despachar().expect(200);

      const [entrega] = await prisma.notificationDelivery.findMany({ take: 1 });

      await expect(
        ownerPrisma().$executeRawUnsafe(
          `INSERT INTO notification_deliveries
             (id, outbox_event_id, recipient_user_id, channel, template, idempotency_key, provider, sent_at)
           VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'PUSH', 'x', $3, 'fake', NOW())`,
          entrega.outboxEventId,
          entrega.recipientUserId,
          entrega.idempotencyKey,
        ),
      ).rejects.toThrow();
    });
  });

  describe('uma transacção revertida não notifica ninguém', () => {
    it('porque o evento nunca chega a existir', async () => {
      // Um pedido sobre uma oferta inexistente falha inteiro.
      await asBuyer()
        .post('/api/deals')
        .send({ offerId: '00000000-0000-4000-8000-000000000000', brief: 'Falha.' })
        .expect(404);

      const { body } = await despachar().expect(200);

      expect(body.sent).toBe(0);
      expect(await prisma.outboxEvent.count()).toBe(0);
    });
  });

  describe('o que cada um vê', () => {
    it('cada pessoa vê as suas notificações, e não as de outra', async () => {
      await criarPedido();
      await despachar().expect(200);

      const doCriador = await asCreator().get('/api/notifications').expect(200);
      const doComprador = await asBuyer().get('/api/notifications').expect(200);

      expect(doCriador.body.data.length).toBeGreaterThan(0);
      expect(doComprador.body.data).toHaveLength(0);
    });

    it('a rota de despacho é da administração — 403 para os outros', async () => {
      await asCreator().post('/api/admin/notifications/dispatch').expect(403);
    });
  });

  describe('o registo continua imutável', () => {
    it('uma notificação enviada não se apaga nem se reescreve', async () => {
      await criarPedido();
      await despachar().expect(200);

      await expect(
        prisma.$executeRawUnsafe(`DELETE FROM notification_deliveries`),
      ).rejects.toThrow();
      await expect(
        prisma.$executeRawUnsafe(`UPDATE notification_deliveries SET template = 'x'`),
      ).rejects.toThrow();
    });
  });
});
