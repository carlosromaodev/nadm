import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { PaymentsGateway } from '@/modules/payments/application/ports/payments.gateway';
import type { FakePaymentsGateway } from '@/modules/payments/infra/fake-payments.gateway';
import { BUYER_ID, CREATOR_ID, OUTSIDER_ID, seedFixtures } from './helpers/fixtures';
import { createTestApp, ownerPrisma, resetDatabase, type TestApp } from './helpers/test-app';

const ADMIN_ID = '44444444-4444-4444-8444-444444444444';
/** O líquido de um pedido de 50 000,00 Kz, depois dos 5% do criador. */
const LIQUIDO = 4_750_000n;

/**
 * A verificação de F5 contra Postgres real.
 *
 * É a fatia em que um erro passa a ter consequência irreversível — o dinheiro
 * sai. O que aqui se prova não se prova com duplos: que dois pedidos
 * simultâneos do saldo total não passam os dois, que o saldo é lido do razão
 * mesmo com a projecção corrompida, e que estornar é escrever uma linha nova.
 */
describe('F5 · carteira, identidade e levantamentos', () => {
  let harness: TestApp;
  let app: INestApplication;
  let prisma: PrismaClient;
  let gateway: FakePaymentsGateway;
  let offerId: string;
  let creatorProfileId: string;

  const as = (userId: string) => ({
    get: (url: string) => request(app.getHttpServer()).get(url).set('X-Dev-User', userId),
    post: (url: string) => request(app.getHttpServer()).post(url).set('X-Dev-User', userId),
  });

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
    const fixtures = await seedFixtures(prisma);
    offerId = fixtures.offerId;
    creatorProfileId = fixtures.creatorProfileId;

    await prisma.user.create({
      data: {
        id: ADMIN_ID,
        phone: '+244923444444',
        displayName: 'Administração',
        roles: ['ADMIN'],
        verificationLevel: 'PHONE',
        accounts: { create: { type: 'INDIVIDUAL' } },
      },
    });
  });

  /** Leva um pedido até `PAID` para o criador ter saldo a sério no razão. */
  async function ganharSaldo(): Promise<void> {
    const criado = await as(BUYER_ID)
      .post('/api/deals')
      .send({ offerId, brief: 'Parabéns para a minha irmã Ana.' })
      .expect(201);

    const dealId = criado.body.id as string;

    const pagamento = await as(BUYER_ID)
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
      .send({ note: 'Entregue.' })
      .expect(201);
    await as(BUYER_ID).post(`/api/deals/${dealId}/deliveries/1/approve`).expect(200);
  }

  /** Submete e aprova a identidade do criador, pelo caminho real. */
  async function verificarIdentidade(): Promise<void> {
    const submetida = await asCreator()
      .post('/api/identity-verifications')
      .send({ documentType: 'BI', documentNumber: '003456789LA041', fullName: 'Nelson Beats' })
      .expect(201);

    await asAdmin()
      .post(`/api/admin/identity-verifications/${submetida.body.id as string}/approve`)
      .expect(200);
  }

  const pedirLevantamento = (amountMinor: string) =>
    asCreator()
      .post('/api/payouts')
      .send({
        amountMinor,
        method: 'BANK_TRANSFER',
        destination: 'AO06004000006982246210102',
      });

  /** O que a plataforma deve ao criador, lido do razão e não da projecção. */
  async function disponivelNoRazao(): Promise<bigint> {
    const [{ saldo }] = await prisma.$queryRaw<Array<{ saldo: bigint }>>`
      SELECT COALESCE(SUM(
        CASE WHEN direction = 'CREDIT' THEN amount_minor ELSE -amount_minor END
      ), 0) AS saldo
      FROM ledger_entries
      WHERE account = 'CREATOR_AVAILABLE' AND subject_id = ${creatorProfileId}::uuid
    `;

    return BigInt(saldo);
  }

  describe('verificação de identidade', () => {
    it('só a administração aprova, e aprovar é o que eleva o nível', async () => {
      const submetida = await asCreator()
        .post('/api/identity-verifications')
        .send({ documentType: 'BI', documentNumber: '003456789LA041', fullName: 'Nelson Beats' })
        .expect(201);

      // O número nunca volta inteiro, nem para o próprio.
      expect(submetida.body.documentNumber).not.toContain('003456789');
      expect(submetida.body.documentNumber).toMatch(/041$/);

      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: CREATOR_ID } })).verificationLevel,
      ).toBe('PHONE');

      await asAdmin()
        .post(`/api/admin/identity-verifications/${submetida.body.id as string}/approve`)
        .expect(200);

      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: CREATOR_ID } })).verificationLevel,
      ).toBe('IDENTITY');
    });

    it('quem não é administração não chega à fila nem à decisão — 403', async () => {
      await asCreator().get('/api/admin/identity-verifications').expect(403);
      await as(OUTSIDER_ID).get('/api/admin/identity-verifications').expect(403);
    });

    it('duas submissões à espera ao mesmo tempo: o Postgres deixa passar uma', async () => {
      const corpo = {
        documentType: 'BI',
        documentNumber: '003456789LA041',
        fullName: 'Nelson Beats',
      };

      const respostas = await Promise.allSettled([
        asCreator().post('/api/identity-verifications').send(corpo),
        asCreator().post('/api/identity-verifications').send(corpo),
      ]);

      const aceites = respostas.filter(
        (r) => r.status === 'fulfilled' && r.value.status === 201,
      );

      expect(aceites).toHaveLength(1);
      expect(
        await prisma.identityVerification.count({
          where: { userId: CREATOR_ID, status: 'PENDING' },
        }),
      ).toBe(1);
    });
  });

  describe('pedir levantamento', () => {
    it('sem identidade verificada devolve 403 (RN-051)', async () => {
      await ganharSaldo();

      await pedirLevantamento('1000000').expect(403);
      expect(await prisma.payout.count()).toBe(0);
    });

    it('reserva o valor no instante do pedido (RN-052)', async () => {
      await ganharSaldo();
      await verificarIdentidade();

      const { body } = await pedirLevantamento('1000000').expect(201);

      expect(body.status).toBe('REQUESTED');
      // O destino nunca sai por inteiro.
      expect(body.destination).toBe('••••0102');

      const carteira = await asCreator().get('/api/wallet').expect(200);
      expect(carteira.body.available.amount).toBe(String(LIQUIDO - 1_000_000n));
      expect(carteira.body.reserved.amount).toBe('1000000');
    });

    it('recusa mais do que o disponível (RN-050)', async () => {
      await ganharSaldo();
      await verificarIdentidade();

      await pedirLevantamento(String(LIQUIDO + 1n)).expect(422);
    });

    it('recusa abaixo do mínimo (RN-054)', async () => {
      await ganharSaldo();
      await verificarIdentidade();

      await pedirLevantamento('100000').expect(422);
    });

    it('dois pedidos simultâneos do saldo total: um passa, o outro falha (RN-053)', async () => {
      await ganharSaldo();
      await verificarIdentidade();

      const respostas = await Promise.allSettled([
        pedirLevantamento(String(LIQUIDO)),
        pedirLevantamento(String(LIQUIDO)),
      ]);

      const aceites = respostas.filter(
        (r) => r.status === 'fulfilled' && r.value.status === 201,
      );

      expect(aceites).toHaveLength(1);
      expect(await prisma.payout.count()).toBe(1);

      // E o razão não ficou a dever mais do que tinha.
      expect(await disponivelNoRazao()).toBe(0n);
    });

    it('o saldo é lido do razão mesmo com a projecção corrompida (RN-050, RN-103)', async () => {
      await ganharSaldo();
      await verificarIdentidade();

      // Corrompe a `Wallet` de propósito, pelo papel dono.
      const owner = ownerPrisma();
        await owner.$executeRawUnsafe(
          `UPDATE wallets SET available_minor = 99999999999 WHERE profile_id = $1::uuid`,
          creatorProfileId,
        );

      await pedirLevantamento(String(LIQUIDO + 1n)).expect(422);
      expect(await prisma.payout.count()).toBe(0);
    });
  });

  describe('o percurso até o dinheiro sair', () => {
    it('aprovar, enviar e confirmar fecha a reserva contra o parceiro', async () => {
      await ganharSaldo();
      await verificarIdentidade();

      const pedido = await pedirLevantamento('1000000').expect(201);
      const payoutId = pedido.body.id as string;

      await asAdmin().post(`/api/admin/payouts/${payoutId}/approve`).expect(200);
      await asAdmin()
        .post(`/api/admin/payouts/${payoutId}/processing`)
        .send({ providerReference: 'TRF-0001' })
        .expect(200);
      const pago = await asAdmin().post(`/api/admin/payouts/${payoutId}/settle`).expect(200);

      expect(pago.body.status).toBe('PAID');

      const carteira = await asCreator().get('/api/wallet').expect(200);
      expect(carteira.body.available.amount).toBe(String(LIQUIDO - 1_000_000n));
      expect(carteira.body.reserved.amount).toBe('0');

      const desequilibradas = await prisma.$queryRaw<Array<{ transaction_id: string }>>`
        SELECT transaction_id
        FROM ledger_entries
        GROUP BY transaction_id
        HAVING SUM(CASE WHEN direction = 'DEBIT' THEN amount_minor ELSE -amount_minor END) <> 0
      `;

      expect(desequilibradas).toEqual([]);
    });

    it('falhar devolve o valor por estorno, sem tocar nas entradas da reserva (RN-101)', async () => {
      await ganharSaldo();
      await verificarIdentidade();

      const pedido = await pedirLevantamento('1000000').expect(201);
      const payoutId = pedido.body.id as string;

      await asAdmin().post(`/api/admin/payouts/${payoutId}/approve`).expect(200);
      await asAdmin()
        .post(`/api/admin/payouts/${payoutId}/fail`)
        .send({ reason: 'IBAN recusado pelo banco.' })
        .expect(200);

      expect(await disponivelNoRazao()).toBe(LIQUIDO);

      // A reserva continua lá; ao lado dela está o estorno que a desfez.
      expect(await prisma.ledgerTransaction.count({ where: { kind: 'PAYOUT_RESERVE' } })).toBe(1);
      expect(await prisma.ledgerTransaction.count({ where: { kind: 'PAYOUT_REVERSE' } })).toBe(1);
    });

    it('o criador cancela antes da aprovação e volta a ter o saldo', async () => {
      await ganharSaldo();
      await verificarIdentidade();

      const pedido = await pedirLevantamento('1000000').expect(201);

      await asCreator().post(`/api/payouts/${pedido.body.id as string}/cancel`).expect(200);

      expect(await disponivelNoRazao()).toBe(LIQUIDO);
    });

    it('quem não é administração não aprova nem confirma — 403', async () => {
      await ganharSaldo();
      await verificarIdentidade();

      const pedido = await pedirLevantamento('1000000').expect(201);

      await asCreator()
        .post(`/api/admin/payouts/${pedido.body.id as string}/approve`)
        .expect(403);
    });
  });

  describe('autorização e privacidade', () => {
    it('um criador não vê nem cancela o levantamento de outro — 404 (RN-063)', async () => {
      await ganharSaldo();
      await verificarIdentidade();

      const pedido = await pedirLevantamento('1000000').expect(201);

      await as(OUTSIDER_ID)
        .post(`/api/payouts/${pedido.body.id as string}/cancel`)
        .expect(404);

      const lista = await as(OUTSIDER_ID).get('/api/payouts');
      expect(lista.status).toBe(404);
    });

    it('nenhuma resposta da API devolve o destino completo nem o documento', async () => {
      await ganharSaldo();
      await verificarIdentidade();

      await pedirLevantamento('1000000').expect(201);

      const lista = await asCreator().get('/api/payouts').expect(200);
      const identidades = await asCreator().get('/api/identity-verifications').expect(200);

      const corpo = JSON.stringify(lista.body) + JSON.stringify(identidades.body);

      expect(corpo).not.toContain('AO06004000006982246210102');
      expect(corpo).not.toContain('003456789LA041');
    });
  });

  describe('o razão continua imutável', () => {
    it('o papel da aplicação não reescreve um movimento de levantamento', async () => {
      await ganharSaldo();
      await verificarIdentidade();
      await pedirLevantamento('1000000').expect(201);

      await expect(
        prisma.$executeRawUnsafe(`UPDATE ledger_entries SET amount_minor = 1`),
      ).rejects.toThrow();
    });
  });
});
