import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { RunDealDeadlinesUseCase } from '@/modules/deals/application/use-cases/run-deal-deadlines.use-case';
import { PaymentsGateway } from '@/modules/payments/application/ports/payments.gateway';
import type { FakePaymentsGateway } from '@/modules/payments/infra/fake-payments.gateway';
import { BUYER_ID, CREATOR_ID, OUTSIDER_ID, seedFixtures } from './helpers/fixtures';
import { createTestApp, ownerPrisma, resetDatabase, type TestApp } from './helpers/test-app';

/**
 * A verificação de F4 contra Postgres real.
 *
 * O que aqui se prova não se prova com duplos: que o estorno e a mudança de
 * estado são atómicos, que a chave semântica do razão trava um segundo
 * lançamento sob concorrência, e que devolver dinheiro continua a ser escrever
 * uma linha nova e nunca alterar uma existente.
 *
 * O relógio da aplicação é o do sistema, e por isso os prazos avançam-se
 * envelhecendo as linhas na base de dados pelo papel dono — nunca esperando.
 */
describe('F4 · caminhos de falha e prazos', () => {
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

  /** Cria um pedido. Sem pagar: o escrow fica em `PENDING`. */
  async function proporPedido(): Promise<string> {
    const criado = await asBuyer()
      .post('/api/deals')
      .send({ offerId, brief: 'Parabéns para a minha irmã Ana.' })
      .expect(201);

    return criado.body.id as string;
  }

  /** Cria e paga. O escrow fica em `HELD`, com o pedido ainda por decidir. */
  async function pedidoPago(): Promise<string> {
    const dealId = await proporPedido();

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

    return dealId;
  }

  async function pedidoAceite(): Promise<string> {
    const dealId = await pedidoPago();
    await asCreator().post(`/api/deals/${dealId}/accept`).expect(201);
    return dealId;
  }

  async function pedidoEntregue(): Promise<string> {
    const dealId = await pedidoAceite();
    await asCreator()
      .post(`/api/deals/${dealId}/deliveries`)
      .send({ note: 'Vídeo gravado e enviado.' })
      .expect(201);
    return dealId;
  }

  /**
   * Envelhece um pedido pelo papel dono, que é o único que pode alterar linhas.
   * É como se avança o tempo sem o esperar.
   */
  async function envelhecer(
    dealId: string,
    campos: Partial<Record<'expires_at' | 'due_at' | 'delivered_at', Date>>,
  ): Promise<void> {
    const owner = ownerPrisma();
      for (const [coluna, valor] of Object.entries(campos)) {
        await owner.$executeRawUnsafe(
          `UPDATE deals SET ${coluna} = $1 WHERE id = $2::uuid`,
          valor,
          dealId,
        );
      }
  }

  const noPassado = (horas: number) => new Date(Date.now() - horas * 60 * 60 * 1000);

  describe('T3 · o criador recusa', () => {
    it('devolve o dinheiro e fecha o negócio, tudo na mesma transacção', async () => {
      const dealId = await pedidoPago();

      const { body } = await asCreator()
        .post(`/api/deals/${dealId}/decline`)
        .send({ reason: 'Estou sem agenda este mês.' })
        .expect(201);

      expect(body.status).toBe('DECLINED');
      expect(body.escrowStatus).toBe('REFUNDED');

      const estorno = await prisma.ledgerTransaction.findFirstOrThrow({
        where: { kind: 'ESCROW_REFUND', dealId },
        include: { entries: true },
      });

      expect(
        estorno.entries
          .map((e) => [e.account, e.direction, e.amountMinor] as const)
          .sort((a, b) => a[0].localeCompare(b[0])),
      ).toEqual([
        ['ESCROW', 'DEBIT', 5_250_000n],
        ['REFUNDS_PAYABLE', 'CREDIT', 5_250_000n],
      ]);
    });

    it('o escrow do pedido fica exactamente a zero, entrada contra entrada', async () => {
      const dealId = await pedidoPago();

      await asCreator().post(`/api/deals/${dealId}/decline`).send({}).expect(201);

      const [{ saldo }] = await prisma.$queryRaw<Array<{ saldo: bigint }>>`
        SELECT COALESCE(SUM(
          CASE WHEN direction = 'DEBIT' THEN amount_minor ELSE -amount_minor END
        ), 0) AS saldo
        FROM ledger_entries
        WHERE account = 'ESCROW' AND subject_id = ${dealId}::uuid
      `;

      expect(saldo.toString()).toBe('0');
    });

    it('cada transacção do razão continua a somar zero (RN-100)', async () => {
      const dealId = await pedidoPago();
      await asCreator().post(`/api/deals/${dealId}/decline`).send({}).expect(201);

      const desequilibradas = await prisma.$queryRaw<Array<{ transaction_id: string }>>`
        SELECT transaction_id
        FROM ledger_entries
        GROUP BY transaction_id
        HAVING SUM(CASE WHEN direction = 'DEBIT' THEN amount_minor ELSE -amount_minor END) <> 0
      `;

      expect(desequilibradas).toEqual([]);
    });

    it('recusar um pedido nunca pago não lança nada e fecha a intenção', async () => {
      const dealId = await proporPedido();

      await asBuyer()
        .post(`/api/deals/${dealId}/payments`)
        .set('Idempotency-Key', `pay-${dealId}`)
        .send({ payerPhone: '+244923222222' })
        .expect(201);

      const { body } = await asCreator()
        .post(`/api/deals/${dealId}/decline`)
        .send({})
        .expect(201);

      expect(body.escrowStatus).toBe('FAILED');
      expect(await prisma.ledgerEntry.count()).toBe(0);
      expect(
        await prisma.paymentIntent.count({
          where: { dealId, status: { in: ['CREATED', 'PENDING'] } },
        }),
      ).toBe(0);
    });

    it('o comprador não recusa o próprio pedido — é do criador', async () => {
      const dealId = await pedidoPago();

      await asBuyer().post(`/api/deals/${dealId}/decline`).send({}).expect(403);
    });

    it('um terceiro não sabe sequer que o pedido existe (RN-063)', async () => {
      const dealId = await pedidoPago();

      await as(OUTSIDER_ID).post(`/api/deals/${dealId}/decline`).send({}).expect(404);
    });
  });

  describe('T11 · o comprador rejeita a entrega', () => {
    it('devolve o trabalho ao criador e mantém o dinheiro retido', async () => {
      const dealId = await pedidoEntregue();

      const { body } = await asBuyer()
        .post(`/api/deals/${dealId}/deliveries/1/reject`)
        .send({ reason: 'O nome da minha irmã está mal pronunciado.' })
        .expect(200);

      expect(body.deal.status).toBe('IN_PROGRESS');
      expect(body.deal.escrowStatus).toBe('HELD');
      expect(body.deal.revisionsRemaining).toBe(0);
      expect(body.delivery.rejectionReason).toBe('O nome da minha irmã está mal pronunciado.');

      // Nada de dinheiro se moveu: só a captura está no razão.
      expect(await prisma.ledgerTransaction.count()).toBe(1);
    });

    it('esgotadas as revisões devolve 422 e não marca a entrega (RN-044)', async () => {
      const dealId = await pedidoEntregue();

      await asBuyer()
        .post(`/api/deals/${dealId}/deliveries/1/reject`)
        .send({ reason: 'O nome está mal pronunciado.' })
        .expect(200);

      await asCreator()
        .post(`/api/deals/${dealId}/deliveries`)
        .send({ note: 'Corrigido.' })
        .expect(201);

      await asBuyer()
        .post(`/api/deals/${dealId}/deliveries/2/reject`)
        .send({ reason: 'Continua mal.' })
        .expect(422);

      const segunda = await prisma.delivery.findFirstOrThrow({ where: { dealId, version: 2 } });
      expect(segunda.rejectedAt).toBeNull();

      const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
      expect(deal.status).toBe('DELIVERED');
      expect(deal.revisionCount).toBe(1);
    });

    it('rejeitar sem motivo é recusado pela validação', async () => {
      const dealId = await pedidoEntregue();

      await asBuyer().post(`/api/deals/${dealId}/deliveries/1/reject`).send({}).expect(400);
    });
  });

  describe('T16 · devolução por atraso', () => {
    it('recusa enquanto o prazo ainda corre', async () => {
      const dealId = await pedidoAceite();

      await asBuyer().post(`/api/deals/${dealId}/refund`).expect(422);
    });

    it('devolve o dinheiro quando o prazo foi ultrapassado com folga', async () => {
      const dealId = await pedidoAceite();

      await envelhecer(dealId, { due_at: noPassado(49) });

      const { body } = await asBuyer().post(`/api/deals/${dealId}/refund`).expect(200);

      expect(body.status).toBe('REFUNDED');
      expect(body.escrowStatus).toBe('REFUNDED');

      const carteira = await asCreator().get('/api/wallet').expect(200);
      expect(carteira.body.available.amount).toBe('0');
    });

    it('dois pedidos simultâneos produzem um único estorno (RN-104)', async () => {
      const dealId = await pedidoAceite();
      await envelhecer(dealId, { due_at: noPassado(49) });

      const respostas = await Promise.allSettled([
        asBuyer().post(`/api/deals/${dealId}/refund`),
        asBuyer().post(`/api/deals/${dealId}/refund`),
      ]);

      const aceites = respostas.filter(
        (r) => r.status === 'fulfilled' && r.value.status === 200,
      );

      expect(aceites).toHaveLength(1);
      expect(await prisma.ledgerTransaction.count({ where: { kind: 'ESCROW_REFUND' } })).toBe(1);
    });
  });

  describe('T13 · a proposta expira sem resposta', () => {
    it('expira e devolve o dinheiro de um pedido já pago', async () => {
      const dealId = await pedidoPago();
      await envelhecer(dealId, { expires_at: noPassado(1) });

      const resultado = await app.get(RunDealDeadlinesUseCase).execute();

      expect(resultado.expired).toBe(1);

      const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
      expect(deal.status).toBe('EXPIRED');
      expect(deal.escrowStatus).toBe('REFUNDED');
      expect(deal.closedAt).not.toBeNull();

      expect(await prisma.ledgerTransaction.count({ where: { kind: 'ESCROW_REFUND' } })).toBe(1);
    });

    it('correr o varrimento duas vezes não duplica o estorno', async () => {
      const dealId = await pedidoPago();
      await envelhecer(dealId, { expires_at: noPassado(1) });

      const sweeper = app.get(RunDealDeadlinesUseCase);
      await sweeper.execute();
      const segunda = await sweeper.execute();

      expect(segunda.expired).toBe(0);
      expect(await prisma.ledgerTransaction.count({ where: { kind: 'ESCROW_REFUND' } })).toBe(1);
    });

    it('não toca num pedido que o criador aceitou antes do prazo', async () => {
      const dealId = await pedidoAceite();
      await envelhecer(dealId, { expires_at: noPassado(1) });

      const resultado = await app.get(RunDealDeadlinesUseCase).execute();

      expect(resultado.expired).toBe(0);
      expect((await prisma.deal.findUniqueOrThrow({ where: { id: dealId } })).status).toBe(
        'ACCEPTED',
      );
    });
  });

  describe('T10 · aprovação automática', () => {
    it('aprova e liberta o dinheiro ao fim da janela, como acto do sistema', async () => {
      const dealId = await pedidoEntregue();
      await envelhecer(dealId, { delivered_at: noPassado(73) });

      const resultado = await app.get(RunDealDeadlinesUseCase).execute();

      expect(resultado.autoApproved).toBe(1);

      const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
      expect(deal.status).toBe('PAID');
      expect(deal.escrowStatus).toBe('RELEASED');

      const carteira = await asCreator().get('/api/wallet').expect(200);
      expect(carteira.body.available.amount).toBe('4750000');

      const registo = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'delivery.auto_approved', subjectId: dealId },
      });
      expect(registo.actorKind).toBe('SYSTEM');
      expect(registo.actorUserId).toBeNull();
    });

    it('não aprova antes de a janela fechar', async () => {
      const dealId = await pedidoEntregue();
      await envelhecer(dealId, { delivered_at: noPassado(71) });

      const resultado = await app.get(RunDealDeadlinesUseCase).execute();

      expect(resultado.autoApproved).toBe(0);
    });
  });

  describe('o razão continua imutável', () => {
    it('o papel da aplicação não altera nem apaga um estorno (RN-101)', async () => {
      const dealId = await pedidoPago();
      await asCreator().post(`/api/deals/${dealId}/decline`).send({}).expect(201);

      await expect(
        prisma.$executeRawUnsafe(`UPDATE ledger_entries SET amount_minor = 1`),
      ).rejects.toThrow();

      await expect(prisma.$executeRawUnsafe(`DELETE FROM ledger_entries`)).rejects.toThrow();
    });
  });
});
