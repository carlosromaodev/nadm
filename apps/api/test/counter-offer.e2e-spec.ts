import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { RunDealDeadlinesUseCase } from '@/modules/deals/application/use-cases/run-deal-deadlines.use-case';
import { PaymentsGateway } from '@/modules/payments/application/ports/payments.gateway';
import type { FakePaymentsGateway } from '@/modules/payments/infra/fake-payments.gateway';
import { BUYER_ID, CREATOR_ID, OUTSIDER_ID, seedFixtures } from './helpers/fixtures';
import { createTestApp, ownerPrisma, resetDatabase, type TestApp } from './helpers/test-app';

/** A oferta semeada custa 50 000,00 Kz; com a taxa o comprador paga 52 500,00. */
const PAGO_ORIGINAL = 5_250_000n;

/**
 * A contraproposta contra Postgres real.
 *
 * O que aqui se prova não se prova com duplos: que só existe uma contraproposta
 * por responder mesmo com dois pedidos em paralelo, que o acerto do escrow é
 * atómico com a troca do acordo, e que um pedido renegociado fecha o escrow a
 * zero exactamente como um pedido normal.
 */
describe('F4 · contraproposta e acerto do escrow', () => {
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
  });

  /** Cria e paga. O escrow fica em `HELD`, com o pedido ainda por decidir. */
  async function pedidoPago(): Promise<string> {
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

    await capturar(pagamento.body.intentId as string);

    return dealId;
  }

  async function capturar(intentId: string): Promise<void> {
    const intent = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intentId } });

    await request(app.getHttpServer())
      .post('/api/webhooks/payments/fake')
      .set('Content-Type', 'application/json')
      .send(gateway.captureAndBuildWebhook(intent.providerReference))
      .expect(201);
  }

  const contrapor = (dealId: string, priceMinor: string, slaHours: number) =>
    asCreator()
      .post(`/api/deals/${dealId}/counter-offers`)
      .send({ priceMinor, slaHours, message: 'Este trabalho leva-me mais tempo.' });

  /** O que o escrow deste pedido vale, lido do razão e não da projecção. */
  async function escrowDe(dealId: string): Promise<bigint> {
    const [{ saldo }] = await prisma.$queryRaw<Array<{ saldo: bigint }>>`
      SELECT COALESCE(SUM(
        CASE WHEN direction = 'CREDIT' THEN amount_minor ELSE -amount_minor END
      ), 0) AS saldo
      FROM ledger_entries
      WHERE account = 'ESCROW' AND subject_id = ${dealId}::uuid
    `;

    return BigInt(saldo);
  }

  describe('T4 · o criador contrapõe', () => {
    it('muda o estado sem mexer no dinheiro', async () => {
      const dealId = await pedidoPago();

      const { body } = await contrapor(dealId, '6000000', 72).expect(201);

      expect(body.deal.status).toBe('COUNTER_OFFERED');
      expect(body.deal.escrowStatus).toBe('HELD');
      expect(body.counterOffer.price).toEqual({ amount: '6000000', currency: 'AOA' });
      expect(await escrowDe(dealId)).toBe(PAGO_ORIGINAL);
    });

    it('duas contrapropostas em paralelo: o Postgres deixa passar uma só', async () => {
      const dealId = await pedidoPago();

      const respostas = await Promise.allSettled([
        contrapor(dealId, '6000000', 72),
        contrapor(dealId, '7000000', 96),
      ]);

      const aceites = respostas.filter(
        (r) => r.status === 'fulfilled' && r.value.status === 201,
      );

      expect(aceites).toHaveLength(1);
      expect(
        await prisma.dealCounterOffer.count({ where: { dealId, status: 'PENDING' } }),
      ).toBe(1);
    });

    it('a um terceiro o pedido não existe (RN-063)', async () => {
      const dealId = await pedidoPago();

      await as(OUTSIDER_ID)
        .post(`/api/deals/${dealId}/counter-offers`)
        .send({ priceMinor: '6000000', slaHours: 72 })
        .expect(404);
    });
  });

  describe('T5 · preço mais baixo — estorno parcial', () => {
    it('acerta o escrow para o valor novo, numa transacção que soma zero', async () => {
      const dealId = await pedidoPago();
      await contrapor(dealId, '4000000', 48).expect(201);

      const { body } = await asBuyer()
        .post(`/api/deals/${dealId}/counter-offers/accept`)
        .expect(200);

      expect(body.outcome).toBe('settled');
      expect(body.deal.status).toBe('PROPOSED');
      expect(body.deal.amount).toEqual({ amount: '4200000', currency: 'AOA' });
      expect(body.deal.offerVersion).toBe(2);

      expect(await escrowDe(dealId)).toBe(4_200_000n);

      const desequilibradas = await prisma.$queryRaw<Array<{ transaction_id: string }>>`
        SELECT transaction_id
        FROM ledger_entries
        GROUP BY transaction_id
        HAVING SUM(CASE WHEN direction = 'DEBIT' THEN amount_minor ELSE -amount_minor END) <> 0
      `;

      expect(desequilibradas).toEqual([]);
    });

    it('o pedido renegociado percorre o ciclo e fecha o escrow a zero', async () => {
      const dealId = await pedidoPago();
      await contrapor(dealId, '4000000', 48).expect(201);
      await asBuyer().post(`/api/deals/${dealId}/counter-offers/accept`).expect(200);

      await asCreator().post(`/api/deals/${dealId}/accept`).expect(201);
      await asCreator()
        .post(`/api/deals/${dealId}/deliveries`)
        .send({ note: 'Entregue.' })
        .expect(201);
      await asBuyer().post(`/api/deals/${dealId}/deliveries/1/approve`).expect(200);

      expect(await escrowDe(dealId)).toBe(0n);

      // 40 000,00 de preço menos os 5% do criador.
      const carteira = await asCreator().get('/api/wallet').expect(200);
      expect(carteira.body.available.amount).toBe('3800000');
    });
  });

  describe('T5 · preço mais alto — o reforço é que fecha o acordo', () => {
    it('aceitar não transita nada: diz quanto falta reforçar', async () => {
      const dealId = await pedidoPago();
      await contrapor(dealId, '6000000', 72).expect(201);

      const { body } = await asBuyer()
        .post(`/api/deals/${dealId}/counter-offers/accept`)
        .expect(200);

      expect(body.outcome).toBe('top_up_required');
      expect(body.topUp).toEqual({ amount: '1050000', currency: 'AOA' });
      expect(body.deal.status).toBe('COUNTER_OFFERED');
      expect(await escrowDe(dealId)).toBe(PAGO_ORIGINAL);
    });

    it('a captura do reforço troca o acordo e faz o escrow valer o preço novo', async () => {
      const dealId = await pedidoPago();
      await contrapor(dealId, '6000000', 72).expect(201);
      await asBuyer().post(`/api/deals/${dealId}/counter-offers/accept`).expect(200);

      const reforco = await asBuyer()
        .post(`/api/deals/${dealId}/counter-offers/top-up`)
        .set('Idempotency-Key', `top-up-${dealId}`)
        .send({ payerPhone: '+244923222222' })
        .expect(201);

      expect(reforco.body.purpose).toBe('TOP_UP');
      expect(reforco.body.amount.amount).toBe('1050000');

      await capturar(reforco.body.intentId as string);

      const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
      expect(deal.status).toBe('PROPOSED');
      expect(deal.amountMinor).toBe(6_300_000n);
      expect(await escrowDe(dealId)).toBe(6_300_000n);

      expect(
        await prisma.dealCounterOffer.count({ where: { dealId, status: 'ACCEPTED' } }),
      ).toBe(1);
    });

    it('o acordo renegociado para cima paga o criador pelo preço novo', async () => {
      const dealId = await pedidoPago();
      await contrapor(dealId, '6000000', 72).expect(201);
      await asBuyer().post(`/api/deals/${dealId}/counter-offers/accept`).expect(200);

      const reforco = await asBuyer()
        .post(`/api/deals/${dealId}/counter-offers/top-up`)
        .set('Idempotency-Key', `top-up-${dealId}`)
        .send({ payerPhone: '+244923222222' })
        .expect(201);

      await capturar(reforco.body.intentId as string);

      await asCreator().post(`/api/deals/${dealId}/accept`).expect(201);
      await asCreator()
        .post(`/api/deals/${dealId}/deliveries`)
        .send({ note: 'Entregue.' })
        .expect(201);
      await asBuyer().post(`/api/deals/${dealId}/deliveries/1/approve`).expect(200);

      // 60 000,00 menos os 5% do criador.
      const carteira = await asCreator().get('/api/wallet').expect(200);
      expect(carteira.body.available.amount).toBe('5700000');
      expect(await escrowDe(dealId)).toBe(0n);
    });
  });

  describe('T6 · o comprador recusa os termos novos', () => {
    it('fecha o negócio e devolve o dinheiro do acordo original', async () => {
      const dealId = await pedidoPago();
      await contrapor(dealId, '6000000', 72).expect(201);

      const { body } = await asBuyer()
        .post(`/api/deals/${dealId}/counter-offers/decline`)
        .expect(200);

      expect(body.status).toBe('DECLINED');
      expect(body.escrowStatus).toBe('REFUNDED');
      expect(await escrowDe(dealId)).toBe(0n);
    });
  });

  describe('T13 · a contraproposta também expira', () => {
    it('sem resposta do comprador o pedido morre e o dinheiro volta', async () => {
      const dealId = await pedidoPago();
      await contrapor(dealId, '6000000', 72).expect(201);

      const owner = ownerPrisma();
        await owner.$executeRawUnsafe(
          `UPDATE deals SET expires_at = $1 WHERE id = $2::uuid`,
          new Date(Date.now() - 60_000),
          dealId,
        );

      expect((await app.get(RunDealDeadlinesUseCase).execute()).expired).toBe(1);

      const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
      expect(deal.status).toBe('EXPIRED');
      expect(deal.escrowStatus).toBe('REFUNDED');
      expect(await escrowDe(dealId)).toBe(0n);
    });
  });

  describe('o razão continua imutável', () => {
    it('o papel da aplicação não reescreve o acerto de uma contraproposta', async () => {
      const dealId = await pedidoPago();
      await contrapor(dealId, '4000000', 48).expect(201);
      await asBuyer().post(`/api/deals/${dealId}/counter-offers/accept`).expect(200);

      await expect(
        prisma.$executeRawUnsafe(`UPDATE ledger_entries SET amount_minor = 1`),
      ).rejects.toThrow();
    });
  });
});
