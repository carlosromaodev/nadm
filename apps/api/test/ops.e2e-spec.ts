import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { PaymentsGateway } from '@/modules/payments/application/ports/payments.gateway';
import type { FakePaymentsGateway } from '@/modules/payments/infra/fake-payments.gateway';
import { BUYER_ID, CREATOR_ID, OUTSIDER_ID, seedFixtures } from './helpers/fixtures';
import {
  createTestApp,
  ownerPrisma,
  resetDatabase,
  type TestApp,
} from './helpers/test-app';

const ADMIN_ID = '66666666-6666-4666-8666-666666666666';

/**
 * A verificação de F10 contra Postgres real.
 *
 * O que aqui se prova é a promessa da fatia: uma divergência injectada de
 * propósito é detectada, e nenhuma correcção acontece sozinha. As consultas
 * cruzadas são SQL sobre tabelas inteiras — é contra a base de dados que fazem
 * sentido, e não contra duplos.
 */
describe('F10 · reconciliação, auditoria e operação', () => {
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

  const asAdmin = () => as(ADMIN_ID);
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
    const fixtures = await seedFixtures(prisma);
    offerId = fixtures.offerId;
    creatorProfileId = fixtures.creatorProfileId;

    await prisma.user.create({
      data: {
        id: ADMIN_ID,
        phone: '+244923666666',
        displayName: 'Administração',
        roles: ['ADMIN'],
        verificationLevel: 'PHONE',
        accounts: { create: { type: 'INDIVIDUAL' } },
      },
    });
  });

  /** Um pedido concluído, para haver razão e carteira a cruzar. */
  async function cicloCompleto(): Promise<string> {
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
      .send({ note: 'Entregue.' })
      .expect(201);
    await asBuyer().post(`/api/deals/${dealId}/deliveries/1/approve`).expect(200);

    return dealId;
  }

  const correr = () => asAdmin().post('/api/admin/reconciliation/run');

  describe('um sistema saudável não tem divergências', () => {
    it('o ciclo completo não produz nenhuma', async () => {
      await cicloCompleto();

      const { body } = await correr().expect(200);

      expect(body).toEqual({ detected: 0, repeated: 0, critical: 0 });
      expect(await prisma.reconciliationFinding.count()).toBe(0);
    });
  });

  describe('a divergência injectada de propósito', () => {
    it('uma carteira corrompida é detectada no ciclo seguinte (RN-103)', async () => {
      await cicloCompleto();

      // Corrompe a projecção pelo papel dono, que é o único que a pode alterar.
      await ownerPrisma().$executeRawUnsafe(
        `UPDATE wallets SET available_minor = 12345 WHERE profile_id = $1::uuid`,
        creatorProfileId,
      );

      const { body } = await correr().expect(200);

      expect(body.detected).toBe(1);
      expect(body.critical).toBe(1);

      const finding = await prisma.reconciliationFinding.findFirstOrThrow({
        where: { kind: 'WALLET_DIVERGENCE' },
      });

      expect(finding.severity).toBe('CRITICAL');
      expect(finding.subjectId).toBe(creatorProfileId);
      // Os dois números ficam, para se perceber o tamanho do problema.
      expect(finding.metadata).toMatchObject({ walletMinor: '12345' });
    });

    it('**a reconciliação não corrige nada**: a carteira continua errada', async () => {
      await cicloCompleto();

      await ownerPrisma().$executeRawUnsafe(
        `UPDATE wallets SET available_minor = 12345 WHERE profile_id = $1::uuid`,
        creatorProfileId,
      );

      await correr().expect(200);

      const wallet = await prisma.wallet.findUniqueOrThrow({
        where: { profileId: creatorProfileId },
      });

      expect(wallet.availableMinor).toBe(12345n);
    });

    it('uma intenção presa há mais de uma hora aparece na lista', async () => {
      const criado = await asBuyer()
        .post('/api/deals')
        .send({ offerId, brief: 'Uma dedicatória.' })
        .expect(201);

      const dealId = criado.body.id as string;

      await asBuyer()
        .post(`/api/deals/${dealId}/payments`)
        .set('Idempotency-Key', `pay-${dealId}`)
        .send({ payerPhone: '+244923222222' })
        .expect(201);

      // Envelhece a intenção: o tempo avança-se, não se espera.
      await ownerPrisma().$executeRawUnsafe(
        `UPDATE payment_intents SET created_at = NOW() - INTERVAL '2 hours' WHERE deal_id = $1::uuid`,
        dealId,
      );

      await correr().expect(200);

      const { body } = await asAdmin().get('/api/admin/reconciliation').expect(200);

      expect(body.data.some((f: { kind: string }) => f.kind === 'STUCK_PAYMENT_INTENT')).toBe(
        true,
      );
    });

    it('escrow preso num pedido fechado é crítico', async () => {
      const dealId = await cicloCompleto();

      // Fecha o pedido sem o escrow ter saído: exactamente o que a tarefa
      // existe para apanhar.
      const owner = ownerPrisma();
      await owner.$executeRawUnsafe(
        `DELETE FROM ledger_entries WHERE transaction_id IN (
           SELECT id FROM ledger_transactions WHERE deal_id = $1::uuid AND kind = 'ESCROW_RELEASE')`,
        dealId,
      );

      const { body } = await correr().expect(200);

      expect(body.critical).toBeGreaterThanOrEqual(1);
      expect(
        await prisma.reconciliationFinding.count({ where: { kind: 'ESCROW_ON_CLOSED_DEAL' } }),
      ).toBe(1);
    });

    it('a mesma divergência não se regista a cada passagem', async () => {
      await cicloCompleto();

      await ownerPrisma().$executeRawUnsafe(
        `UPDATE wallets SET available_minor = 12345 WHERE profile_id = $1::uuid`,
        creatorProfileId,
      );

      await correr().expect(200);
      const segunda = await correr().expect(200);

      expect(segunda.body.detected).toBe(0);
      expect(segunda.body.repeated).toBe(1);
      expect(await prisma.reconciliationFinding.count()).toBe(1);
    });
  });

  describe('fechar uma divergência', () => {
    async function umaAberta(): Promise<string> {
      await cicloCompleto();
      await ownerPrisma().$executeRawUnsafe(
        `UPDATE wallets SET available_minor = 12345 WHERE profile_id = $1::uuid`,
        creatorProfileId,
      );
      await correr().expect(200);

      const { body } = await asAdmin().get('/api/admin/reconciliation').expect(200);
      return body.data[0].id as string;
    }

    it('exige dizer o que se fez, e guarda quem o disse', async () => {
      const id = await umaAberta();

      await asAdmin()
        .post(`/api/admin/reconciliation/${id}/close`)
        .send({ outcome: 'RESOLVED', note: '' })
        .expect(400);

      const { body } = await asAdmin()
        .post(`/api/admin/reconciliation/${id}/close`)
        .send({ outcome: 'RESOLVED', note: 'Carteira recalculada a partir do razão.' })
        .expect(200);

      expect(body.status).toBe('RESOLVED');

      const guardada = await prisma.reconciliationFinding.findUniqueOrThrow({ where: { id } });
      expect(guardada.resolvedByUserId).toBe(ADMIN_ID);
    });

    it('quem não é administração não vê nem fecha — 403', async () => {
      const id = await umaAberta();

      await asCreator().get('/api/admin/reconciliation').expect(403);
      await asCreator()
        .post(`/api/admin/reconciliation/${id}/close`)
        .send({ outcome: 'RESOLVED', note: 'x' })
        .expect(403);
    });
  });

  describe('suspender uma conta', () => {
    it('tira o acesso de imediato, e reactivar devolve-o', async () => {
      await asAdmin()
        .post(`/api/users/${OUTSIDER_ID}/suspend`)
        .send({ reason: 'Pediu pagamento por fora da plataforma.' })
        .expect(404);

      await asAdmin()
        .post(`/api/admin/users/${OUTSIDER_ID}/suspend`)
        .send({ reason: 'Pediu pagamento por fora da plataforma.' })
        .expect(204);

      // A guarda recusa qualquer pedido de quem não está activo.
      await as(OUTSIDER_ID).get('/api/deals').expect(401);

      await asAdmin()
        .post(`/api/admin/users/${OUTSIDER_ID}/reinstate`)
        .send({ note: 'Foi engano nosso.' })
        .expect(204);

      await as(OUTSIDER_ID).get('/api/deals').expect(200);
    });

    it('suspender sem motivo é recusado pela validação', async () => {
      await asAdmin()
        .post(`/api/admin/users/${OUTSIDER_ID}/suspend`)
        .send({ reason: '' })
        .expect(400);
    });

    it('um administrador não se suspende a si próprio', async () => {
      await asAdmin()
        .post(`/api/admin/users/${ADMIN_ID}/suspend`)
        .send({ reason: 'engano' })
        .expect(403);
    });
  });

  describe('a auditoria é consultável', () => {
    it('mostra o rasto de um pedido, por ordem', async () => {
      const dealId = await cicloCompleto();

      const { body } = await asAdmin()
        .get(`/api/admin/audit?subjectType=Deal&subjectId=${dealId}`)
        .expect(200);

      const accoes = body.data.map((entrada: { action: string }) => entrada.action);

      expect(accoes).toContain('deal.created');
      expect(accoes).toContain('escrow.released');
    });

    it('não é alcançável por quem não é administração', async () => {
      await asCreator().get('/api/admin/audit').expect(403);
    });

    it('o razão e a auditoria continuam imutáveis', async () => {
      await cicloCompleto();

      await expect(prisma.$executeRawUnsafe(`DELETE FROM audit_logs`)).rejects.toThrow();
      await expect(
        prisma.$executeRawUnsafe(`UPDATE ledger_entries SET amount_minor = 1`),
      ).rejects.toThrow();
    });
  });

  describe('as métricas', () => {
    it('contam o que aconteceu, com o dinheiro em string (RN-111)', async () => {
      await cicloCompleto();

      const { body } = await asAdmin().get('/api/admin/metrics').expect(200);

      expect(body.negocio.dealsCriados).toBe(1);
      expect(body.negocio.dealsConcluidos).toBe(1);
      expect(typeof body.dinheiro.libertadoMinor).toBe('string');
      expect(body.dinheiro.libertadoMinor).toBe('5000000');
      expect(body.integridade.divergenciasAbertas).toBe(0);
    });

    it('as filas da administração aparecem todas no mesmo sítio', async () => {
      const dealId = await cicloCompleto();
      await asBuyer()
        .post(`/api/deals/${dealId}/review`)
        .send({ rating: 5, body: 'Excelente.' })
        .expect(201);

      const { body } = await asAdmin().get('/api/admin/metrics').expect(200);

      expect(body.filas).toEqual({
        disputasAbertas: 0,
        levantamentosPorDecidir: 0,
        identidadesPorDecidir: 0,
      });
    });
  });
});
