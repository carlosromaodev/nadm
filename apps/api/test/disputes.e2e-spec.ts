import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { PaymentsGateway } from '@/modules/payments/application/ports/payments.gateway';
import type { FakePaymentsGateway } from '@/modules/payments/infra/fake-payments.gateway';
import { BUYER_ID, CREATOR_ID, OUTSIDER_ID, seedFixtures } from './helpers/fixtures';
import { createTestApp, resetDatabase, type TestApp } from './helpers/test-app';

const ADMIN_ID = '55555555-5555-4555-8555-555555555555';
const MOTIVO = 'O vídeo não tem nada a ver com o que pedi.';

/**
 * A verificação de F6 contra Postgres real.
 *
 * O que aqui se prova não se prova com duplos: que duas disputas abertas ao
 * mesmo tempo no mesmo `Deal` não passam as duas, que a decisão e o estorno são
 * atómicos, e que a administração não lê a conversa de ninguém sem ficar
 * escrito que leu.
 */
describe('F6 · avaliações e disputas', () => {
  let harness: TestApp;
  let app: INestApplication;
  let prisma: PrismaClient;
  let gateway: FakePaymentsGateway;
  let offerId: string;

  const as = (userId: string) => ({
    get: (url: string) => request(app.getHttpServer()).get(url).set('X-Dev-User', userId),
    post: (url: string) => request(app.getHttpServer()).post(url).set('X-Dev-User', userId),
  });

  const asBuyer = () => as(BUYER_ID);
  const asCreator = () => as(CREATOR_ID);
  const asAdmin = () => as(ADMIN_ID);

  beforeAll(async () => {
    harness = await createTestApp();
    app = harness.app;
    prisma = harness.prisma;
    gateway = app.get(PaymentsGateway) as FakePaymentsGateway;
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await resetDatabase();
    offerId = (await seedFixtures(prisma)).offerId;

    await prisma.user.create({
      data: {
        id: ADMIN_ID,
        phone: '+244923555555',
        displayName: 'Administração',
        roles: ['ADMIN'],
        verificationLevel: 'PHONE',
        accounts: { create: { type: 'INDIVIDUAL' } },
      },
    });
  });

  /** Leva um pedido até `DELIVERED`, que é onde a disputa faz sentido. */
  async function pedidoEntregue(): Promise<string> {
    const criado = await asBuyer()
      .post('/api/deals')
      .send({ offerId, brief: 'Parabéns para a minha irmã Ana.' })
      .expect(201);

    const dealId = criado.body.id as string;

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

    await asCreator().post(`/api/deals/${dealId}/accept`).expect(201);
    await asCreator()
      .post(`/api/deals/${dealId}/deliveries`)
      .send({ note: 'Vídeo gravado e enviado.' })
      .expect(201);

    return dealId;
  }

  const abrirDisputa = (dealId: string, quem = asBuyer()) =>
    quem.post(`/api/deals/${dealId}/disputes`).send({ reason: MOTIVO });

  describe('abrir a disputa', () => {
    it('qualquer uma das partes abre, e o dinheiro não se mexe', async () => {
      const dealId = await pedidoEntregue();

      const { body } = await abrirDisputa(dealId, asCreator()).expect(201);

      expect(body.dispute.status).toBe('OPEN');
      expect(body.deal.escrowStatus).toBe('HELD');
      expect(await prisma.ledgerTransaction.count()).toBe(1);
    });

    it('duas disputas em paralelo: o Postgres deixa passar uma só', async () => {
      const dealId = await pedidoEntregue();

      const respostas = await Promise.allSettled([
        abrirDisputa(dealId, asBuyer()),
        abrirDisputa(dealId, asCreator()),
      ]);

      const aceites = respostas.filter(
        (r) => r.status === 'fulfilled' && r.value.status === 201,
      );

      expect(aceites).toHaveLength(1);
      expect(await prisma.dispute.count({ where: { dealId, status: 'OPEN' } })).toBe(1);
    });

    it('o detalhe do pedido leva a disputa aberta, e diz quem a abriu', async () => {
      const dealId = await pedidoEntregue();
      await abrirDisputa(dealId, asBuyer()).expect(201);

      // É o que o ecrã precisa para oferecer retirar a quem a abriu, e não aos
      // outros.
      const doComprador = await asBuyer().get(`/api/deals/${dealId}`).expect(200);
      const doCriador = await asCreator().get(`/api/deals/${dealId}`).expect(200);

      expect(doComprador.body.dispute.status).toBe('OPEN');
      expect(doComprador.body.dispute.openedByUserId).toBe(BUYER_ID);
      expect(doCriador.body.dispute.openedByUserId).toBe(BUYER_ID);
    });

    it('sem disputa aberta, o detalhe não traz nenhuma', async () => {
      const dealId = await pedidoEntregue();

      const { body } = await asBuyer().get(`/api/deals/${dealId}`).expect(200);

      expect(body.dispute).toBeNull();
    });

    it('retirada a disputa, o detalhe volta a não trazer nenhuma', async () => {
      const dealId = await pedidoEntregue();
      await abrirDisputa(dealId, asBuyer()).expect(201);

      await asBuyer().post(`/api/deals/${dealId}/disputes/withdraw`).expect(200);

      const { body } = await asBuyer().get(`/api/deals/${dealId}`).expect(200);
      expect(body.dispute).toBeNull();
    });

    it('a um terceiro o pedido não existe (RN-063)', async () => {
      const dealId = await pedidoEntregue();

      await abrirDisputa(dealId, as(OUTSIDER_ID)).expect(404);
    });
  });

  describe('RN-048 · a disputa trava a libertação', () => {
    it('aprovar com disputa aberta devolve 422 e não liberta nada', async () => {
      const dealId = await pedidoEntregue();
      await abrirDisputa(dealId).expect(201);

      await asBuyer().post(`/api/deals/${dealId}/deliveries/1/approve`).expect(422);

      const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
      expect(deal.status).toBe('DELIVERED');
      expect(deal.escrowStatus).toBe('HELD');
      expect(await prisma.ledgerTransaction.count({ where: { kind: 'ESCROW_RELEASE' } })).toBe(0);
    });

    it('retirada a disputa, a aprovação volta a libertar', async () => {
      const dealId = await pedidoEntregue();
      await abrirDisputa(dealId).expect(201);

      await asBuyer().post(`/api/deals/${dealId}/disputes/withdraw`).expect(200);

      const { body } = await asBuyer()
        .post(`/api/deals/${dealId}/deliveries/1/approve`)
        .expect(200);

      expect(body.status).toBe('PAID');
    });
  });

  describe('T15 · a decisão da administração', () => {
    it('a favor do comprador devolve o dinheiro e fecha o razão em zero', async () => {
      const dealId = await pedidoEntregue();
      const aberta = await abrirDisputa(dealId).expect(201);

      const { body } = await asAdmin()
        .post(`/api/admin/disputes/${aberta.body.dispute.id as string}/resolve`)
        .send({ resolution: 'BUYER', note: 'A entrega não corresponde ao briefing.' })
        .expect(200);

      expect(body.deal.status).toBe('REFUNDED');
      expect(body.deal.escrowStatus).toBe('REFUNDED');

      const [{ saldo }] = await prisma.$queryRaw<Array<{ saldo: bigint }>>`
        SELECT COALESCE(SUM(
          CASE WHEN direction = 'DEBIT' THEN amount_minor ELSE -amount_minor END
        ), 0) AS saldo
        FROM ledger_entries
        WHERE account = 'ESCROW' AND subject_id = ${dealId}::uuid
      `;

      expect(saldo.toString()).toBe('0');

      const desequilibradas = await prisma.$queryRaw<Array<{ transaction_id: string }>>`
        SELECT transaction_id
        FROM ledger_entries
        GROUP BY transaction_id
        HAVING SUM(CASE WHEN direction = 'DEBIT' THEN amount_minor ELSE -amount_minor END) <> 0
      `;

      expect(desequilibradas).toEqual([]);
    });

    it('a favor do criador não move dinheiro e desbloqueia a libertação', async () => {
      const dealId = await pedidoEntregue();
      const aberta = await abrirDisputa(dealId).expect(201);

      await asAdmin()
        .post(`/api/admin/disputes/${aberta.body.dispute.id as string}/resolve`)
        .send({ resolution: 'CREATOR' })
        .expect(200);

      expect(await prisma.ledgerTransaction.count({ where: { kind: 'ESCROW_REFUND' } })).toBe(0);

      const { body } = await asBuyer()
        .post(`/api/deals/${dealId}/deliveries/1/approve`)
        .expect(200);

      expect(body.status).toBe('PAID');
    });

    it('quem não é administração não decide — 403', async () => {
      const dealId = await pedidoEntregue();
      const aberta = await abrirDisputa(dealId).expect(201);

      await asCreator()
        .post(`/api/admin/disputes/${aberta.body.dispute.id as string}/resolve`)
        .send({ resolution: 'CREATOR' })
        .expect(403);
    });

    it('uma disputa resolvida guarda quem decidiu e a favor de quem', async () => {
      const dealId = await pedidoEntregue();
      const aberta = await abrirDisputa(dealId).expect(201);

      await asAdmin()
        .post(`/api/admin/disputes/${aberta.body.dispute.id as string}/resolve`)
        .send({ resolution: 'BUYER' })
        .expect(200);

      const dispute = await prisma.dispute.findUniqueOrThrow({
        where: { id: aberta.body.dispute.id as string },
      });

      expect(dispute.status).toBe('RESOLVED');
      expect(dispute.resolution).toBe('BUYER');
      expect(dispute.decidedByUserId).toBe(ADMIN_ID);
      expect(dispute.decidedAt).not.toBeNull();
    });
  });

  describe('RN-064 · a administração na conversa', () => {
    it('lê com disputa aberta, e a leitura fica na auditoria', async () => {
      const dealId = await pedidoEntregue();
      await abrirDisputa(dealId).expect(201);

      const { body } = await asAdmin()
        .get(`/api/admin/disputes/deals/${dealId}/conversation`)
        .expect(200);

      expect(body.messages.length).toBeGreaterThan(0);

      expect(
        await prisma.auditLog.count({
          where: { action: 'admin.conversation_read', subjectId: dealId, actorUserId: ADMIN_ID },
        }),
      ).toBe(1);
    });

    it('sem disputa aberta não lê, e não fica registo nenhum', async () => {
      const dealId = await pedidoEntregue();

      await asAdmin().get(`/api/admin/disputes/deals/${dealId}/conversation`).expect(409);

      expect(
        await prisma.auditLog.count({ where: { action: 'admin.conversation_read' } }),
      ).toBe(0);
    });

    it('as mensagens da administração chegam às duas partes como SYSTEM', async () => {
      const dealId = await pedidoEntregue();
      await abrirDisputa(dealId).expect(201);

      await asAdmin()
        .post(`/api/admin/disputes/deals/${dealId}/messages`)
        .send({ body: 'Vamos analisar e responder em 48 horas.' })
        .expect(201);

      const doComprador = await asBuyer().get(`/api/deals/${dealId}`).expect(200);
      const doCriador = await asCreator().get(`/api/deals/${dealId}`).expect(200);

      for (const vista of [doComprador, doCriador]) {
        const mensagem = vista.body.messages.find(
          (m: { body: string }) => m.body === 'Vamos analisar e responder em 48 horas.',
        );

        expect(mensagem.kind).toBe('SYSTEM');
        expect(mensagem.senderUserId).toBeNull();
      }
    });
  });

  describe('avaliações', () => {
    /** Leva um pedido a `PAID` e avalia-o. */
    async function avaliado(): Promise<string> {
      const dealId = await pedidoEntregue();
      await asBuyer().post(`/api/deals/${dealId}/deliveries/1/approve`).expect(200);
      await asBuyer()
        .post(`/api/deals/${dealId}/review`)
        .send({ rating: 4, body: 'Ficou bom.' })
        .expect(201);

      return dealId;
    }

    it('o criador responde uma vez, e a segunda é recusada', async () => {
      const dealId = await avaliado();

      const { body } = await asCreator()
        .post(`/api/deals/${dealId}/review/reply`)
        .send({ reply: 'Obrigado!' })
        .expect(200);

      expect(body.reply).toBe('Obrigado!');

      await asCreator()
        .post(`/api/deals/${dealId}/review/reply`)
        .send({ reply: 'Afinal não.' })
        .expect(422);
    });

    it('o comprador não responde à sua própria avaliação — 403', async () => {
      const dealId = await avaliado();

      await asBuyer()
        .post(`/api/deals/${dealId}/review/reply`)
        .send({ reply: 'Eu respondo.' })
        .expect(403);
    });

    it('a média sai no perfil público, em décimas e em inteiros', async () => {
      await avaliado();

      const { body } = await request(app.getHttpServer())
        .get('/api/profiles/nelsonbeats/reviews')
        .expect(200);

      expect(body.rating).toEqual({ averageTenths: 40, count: 1 });
      expect(typeof body.rating.averageTenths).toBe('number');
      expect(Number.isInteger(body.rating.averageTenths)).toBe(true);
    });

    it('o papel da aplicação não reescreve a nota nem o texto do comprador', async () => {
      await avaliado();

      // A migração 016 dá `UPDATE` só em `reply` e `replied_at`.
      await expect(
        prisma.$executeRawUnsafe(`UPDATE reviews SET rating = 1`),
      ).rejects.toThrow();

      await expect(prisma.$executeRawUnsafe(`DELETE FROM reviews`)).rejects.toThrow();
    });

    it('avaliar um pedido não concluído devolve 422 (RN-047)', async () => {
      const dealId = await pedidoEntregue();

      await asBuyer()
        .post(`/api/deals/${dealId}/review`)
        .send({ rating: 5, body: 'Adiantado.' })
        .expect(422);
    });
  });
});
