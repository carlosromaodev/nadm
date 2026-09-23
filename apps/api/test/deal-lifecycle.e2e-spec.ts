import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { PaymentsGateway } from '@/modules/payments/application/ports/payments.gateway';
import type { FakePaymentsGateway } from '@/modules/payments/infra/fake-payments.gateway';
import { BUYER_ID, CREATOR_ID, OUTSIDER_ID, seedFixtures } from './helpers/fixtures';
import { createTestApp, resetDatabase, type TestApp } from './helpers/test-app';

/**
 * A verificação de F1: o ciclo completo contra Postgres real, ponta a ponta.
 *
 * É este ficheiro que responde à pergunta que a fatia existe para responder —
 * a entidade única aguenta pedido, pagamento, conversa e entrega?
 */
describe('F1 · ciclo completo do Deal', () => {
  let harness: TestApp;
  let app: INestApplication;
  let prisma: PrismaClient;
  let gateway: FakePaymentsGateway;
  let offerId: string;
  let creatorProfileId: string;

  /** Pedidos feitos como um utilizador concreto, via o adaptador provisório. */
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
    const fixtures = await seedFixtures(prisma);
    offerId = fixtures.offerId;
    creatorProfileId = fixtures.creatorProfileId;
  });

  /** Percorre o caminho feliz e devolve o `Deal` no fim. */
  async function percorrerCicloCompleto() {
    const criado = await request(app.getHttpServer())
      .post('/api/deals')
      .set('X-Dev-User', BUYER_ID)
      .send({ offerId, brief: 'Parabéns para a minha irmã Ana, faz 30 anos no sábado.' })
      .expect(201);

    const dealId = criado.body.id as string;

    const pagamento = await request(app.getHttpServer())
      .post(`/api/deals/${dealId}/payments`)
      .set('X-Dev-User', BUYER_ID)
      .set('Idempotency-Key', `pay-${dealId}`)
      .send({ payerPhone: '+244923222222' })
      .expect(201);

    const intent = await prisma.paymentIntent.findUniqueOrThrow({
      where: { id: pagamento.body.intentId as string },
    });

    const webhook = gateway.captureAndBuildWebhook(intent.providerReference);

    await request(app.getHttpServer())
      .post('/api/webhooks/payments/fake')
      .set('Content-Type', 'application/json')
      .send(webhook)
      .expect(201);

    // Só agora o criador decide: o dinheiro já está retido.
    await request(app.getHttpServer())
      .post(`/api/deals/${dealId}/accept`)
      .set('X-Dev-User', CREATOR_ID)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/deals/${dealId}/deliveries`)
      .set('X-Dev-User', CREATOR_ID)
      .send({ note: 'Vídeo gravado e enviado. Espero que a Ana goste!' })
      .expect(201);

    const aprovado = await request(app.getHttpServer())
      .post(`/api/deals/${dealId}/deliveries/1/approve`)
      .set('X-Dev-User', BUYER_ID)
      .expect(200);

    return { dealId, body: aprovado.body as Record<string, unknown> };
  }

  describe('o percurso', () => {
    it('vai de PROPOSED a PAID e liberta o dinheiro', async () => {
      const { body } = await percorrerCicloCompleto();

      expect(body.status).toBe('PAID');
      expect(body.escrowStatus).toBe('RELEASED');
    });

    it('a conversa abre com o pedido lá dentro', async () => {
      const criado = await asBuyer()
        .post('/api/deals')
        .send({ offerId, brief: 'Uma dedicatória para a Ana.' })
        .expect(201);

      const conversa = await asBuyer()
        .get(`/api/deals/${criado.body.id as string}/messages`)
        .expect(200);

      expect(conversa.body.data[0]).toMatchObject({
        kind: 'TEXT',
        senderUserId: BUYER_ID,
        body: 'Uma dedicatória para a Ana.',
      });
    });

    it('a conversa conta a história completa do negócio (RN-049)', async () => {
      const { dealId } = await percorrerCicloCompleto();

      const conversa = await asBuyer().get(`/api/deals/${dealId}/messages`).expect(200);

      const transicoes = (conversa.body.data as Array<{ kind: string; body: string }>)
        .filter((mensagem) => mensagem.kind === 'STATE_CHANGE')
        .map((mensagem) => mensagem.body);

      expect(transicoes).toEqual([
        'Pedido criado. Falta o pagamento para o criador o poder decidir.',
        'Pagamento confirmado. O valor fica retido na NaDM até aprovares a entrega.',
        'O criador aceitou o pedido. O prazo de entrega começou a contar.',
        'O criador submeteu a entrega.',
        'A entrega foi aprovada.',
        'O valor foi libertado para a carteira do criador.',
      ]);
    });

    it('o pedido, a conversa e a entrega vêm na mesma resposta — são a mesma entidade', async () => {
      const { dealId } = await percorrerCicloCompleto();

      const detalhe = await asBuyer().get(`/api/deals/${dealId}`).expect(200);

      expect(detalhe.body.reference).toMatch(/^NDM-\d{4}-\d{7}$/);
      expect(detalhe.body.messages.length).toBeGreaterThan(0);
      expect(detalhe.body.deliveries).toHaveLength(1);
      expect(detalhe.body.viewerRole).toBe('buyer');
    });
  });

  describe('o dinheiro', () => {
    it('cada transacção do razão soma exactamente zero (RN-100)', async () => {
      await percorrerCicloCompleto();

      const desequilibradas = await prisma.$queryRaw<Array<{ transaction_id: string }>>`
        SELECT transaction_id
        FROM ledger_entries
        GROUP BY transaction_id
        HAVING SUM(CASE WHEN direction = 'DEBIT' THEN amount_minor ELSE -amount_minor END) <> 0
      `;

      expect(desequilibradas).toEqual([]);
    });

    it('o criador recebe exactamente o líquido e a plataforma exactamente a comissão', async () => {
      await percorrerCicloCompleto();

      const entradas = await prisma.ledgerEntry.findMany();

      // Ordenado aqui, não na consulta: `ORDER BY` sobre um enum do Postgres
      // segue a ordem de declaração, que não é a alfabética.
      expect(
        entradas
          .map((entrada) => [entrada.account, entrada.direction, entrada.amountMinor] as const)
          .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1])),
      ).toEqual([
        ['CREATOR_AVAILABLE', 'CREDIT', 5_000_000n],
        ['CREATOR_AVAILABLE', 'DEBIT', 250_000n],
        // A captura credita o escrow (E1); a libertação debita-o (E2). O que
        // entrou e o que saiu tem de aparecer, e tem de fechar a zero.
        ['ESCROW', 'CREDIT', 5_250_000n],
        ['ESCROW', 'DEBIT', 5_250_000n],
        ['PLATFORM_FEE_REVENUE', 'CREDIT', 500_000n],
        ['PROVIDER_CLEARING', 'DEBIT', 5_250_000n],
      ]);
    });

    it('a carteira do criador bate certo com a soma do razão (RN-103)', async () => {
      await percorrerCicloCompleto();

      const carteira = await asCreator().get('/api/wallet').expect(200);

      const [{ saldo }] = await prisma.$queryRaw<Array<{ saldo: bigint }>>`
        SELECT COALESCE(SUM(
          CASE WHEN direction = 'CREDIT' THEN amount_minor ELSE -amount_minor END
        ), 0) AS saldo
        FROM ledger_entries
        WHERE account = 'CREATOR_AVAILABLE' AND subject_id = ${creatorProfileId}::uuid
      `;

      expect(carteira.body.available.amount).toBe('4750000');
      expect(saldo.toString()).toBe(carteira.body.available.amount);
    });

    it('dinheiro sai como string de inteiro, nunca como número JSON (RN-111)', async () => {
      const { body } = await percorrerCicloCompleto();

      expect(body.amount).toEqual({ amount: '5250000', currency: 'AOA' });
      expect(typeof (body.amount as { amount: unknown }).amount).toBe('string');
    });

    it('o escrow só se move depois da captura, nunca antes', async () => {
      const criado = await asBuyer()
        .post('/api/deals')
        .send({ offerId, brief: 'Uma dedicatória.' })
        .expect(201);

      await asBuyer()
        .post(`/api/deals/${criado.body.id as string}/payments`)
        .set('Idempotency-Key', 'k1')
        .send({ payerPhone: '+244923222222' })
        .expect(201);

      const deal = await prisma.deal.findUniqueOrThrow({
        where: { id: criado.body.id as string },
      });

      expect(deal.escrowStatus).toBe('PENDING');
      expect(await prisma.ledgerEntry.count()).toBe(0);
    });
  });

  describe('corridas e idempotência', () => {
    it('duas tentativas de pagamento simultâneas deixam uma só intenção activa (RN-092)', async () => {
      const criado = await asBuyer()
        .post('/api/deals')
        .send({ offerId, brief: 'Uma dedicatória.' })
        .expect(201);

      const dealId = criado.body.id as string;

      const respostas = await Promise.all(
        ['chave-a', 'chave-b'].map((chave) =>
          request(app.getHttpServer())
            .post(`/api/deals/${dealId}/payments`)
            .set('X-Dev-User', BUYER_ID)
            .set('Idempotency-Key', chave)
            .send({ payerPhone: '+244923222222' }),
        ),
      );

      const estados = respostas.map((resposta) => resposta.status).sort();

      expect(estados).toEqual([201, 409]);
      expect(await prisma.paymentIntent.count({ where: { dealId } })).toBe(1);
    });

    it('a mesma Idempotency-Key devolve a intenção existente (RN-090)', async () => {
      const criado = await asBuyer()
        .post('/api/deals')
        .send({ offerId, brief: 'Uma dedicatória.' })
        .expect(201);

      const dealId = criado.body.id as string;

      const primeira = await asBuyer()
        .post(`/api/deals/${dealId}/payments`)
        .set('Idempotency-Key', 'mesma-chave')
        .send({ payerPhone: '+244923222222' })
        .expect(201);

      const segunda = await asBuyer()
        .post(`/api/deals/${dealId}/payments`)
        .set('Idempotency-Key', 'mesma-chave')
        .send({ payerPhone: '+244923222222' })
        .expect(201);

      expect(segunda.body.intentId).toBe(primeira.body.intentId);
      expect(segunda.body.replayed).toBe(true);
      expect(await prisma.paymentIntent.count({ where: { dealId } })).toBe(1);
    });

    it('a mesma notificação entregue duas vezes lança no razão uma só vez (RN-091)', async () => {
      const criado = await asBuyer()
        .post('/api/deals')
        .send({ offerId, brief: 'Uma dedicatória.' })
        .expect(201);

      const dealId = criado.body.id as string;

      const pagamento = await asBuyer()
        .post(`/api/deals/${dealId}/payments`)
        .set('Idempotency-Key', 'k1')
        .send({ payerPhone: '+244923222222' })
        .expect(201);

      const intent = await prisma.paymentIntent.findUniqueOrThrow({
        where: { id: pagamento.body.intentId as string },
      });

      const webhook = gateway.captureAndBuildWebhook(intent.providerReference, 'evt-repetido');

      const primeira = await request(app.getHttpServer())
        .post('/api/webhooks/payments/fake')
        .set('Content-Type', 'application/json')
        .send(webhook)
        .expect(201);

      const segunda = await request(app.getHttpServer())
        .post('/api/webhooks/payments/fake')
        .set('Content-Type', 'application/json')
        .send(webhook)
        .expect(201);

      expect(primeira.body.outcome).toBe('captured');
      expect(segunda.body.outcome).toBe('duplicate');
      expect(await prisma.paymentEvent.count()).toBe(1);
    });

    it('aprovar duas vezes não duplica lançamentos (RN-104)', async () => {
      const { dealId } = await percorrerCicloCompleto();

      await asBuyer().post(`/api/deals/${dealId}/deliveries/1/approve`).expect(200);

      // Duas transacções: a captura e a libertação. Nem uma a mais.
      expect(await prisma.ledgerTransaction.count()).toBe(2);
      expect(await prisma.ledgerEntry.count()).toBe(6);
    });
  });

  describe('a prova negativa (RN-063)', () => {
    it('um terceiro recebe 404 ao abrir um pedido alheio', async () => {
      const { dealId } = await percorrerCicloCompleto();

      await request(app.getHttpServer())
        .get(`/api/deals/${dealId}`)
        .set('X-Dev-User', OUTSIDER_ID)
        .expect(404);
    });

    it('um pedido alheio e um pedido inexistente dão a mesma resposta', async () => {
      const { dealId } = await percorrerCicloCompleto();

      const alheio = await request(app.getHttpServer())
        .get(`/api/deals/${dealId}`)
        .set('X-Dev-User', OUTSIDER_ID)
        .expect(404);

      const inexistente = await request(app.getHttpServer())
        .get('/api/deals/99999999-9999-4999-8999-999999999999')
        .set('X-Dev-User', OUTSIDER_ID)
        .expect(404);

      expect(alheio.body.error).toBe(inexistente.body.error);
    });

    it('um terceiro não lê a conversa alheia', async () => {
      const { dealId } = await percorrerCicloCompleto();

      await request(app.getHttpServer())
        .get(`/api/deals/${dealId}/messages`)
        .set('X-Dev-User', OUTSIDER_ID)
        .expect(404);
    });

    it('o pedido alheio não aparece na lista do terceiro', async () => {
      await percorrerCicloCompleto();

      const lista = await request(app.getHttpServer())
        .get('/api/deals?role=buyer')
        .set('X-Dev-User', OUTSIDER_ID)
        .expect(200);

      expect(lista.body.data).toEqual([]);
    });

    it('o criador é parte mas não aprova — 403, e a existência não é segredo para ele', async () => {
      const criado = await asBuyer()
        .post('/api/deals')
        .send({ offerId, brief: 'Uma dedicatória.' })
        .expect(201);

      // O papel é verificado antes do estado: nem sequer chega a interessar se
      // o pedido está ou não em condições de ser aprovado.
      await asCreator()
        .post(`/api/deals/${criado.body.id as string}/deliveries/1/approve`)
        .expect(403);
    });

    it('sem identificação, nenhuma rota privada responde', async () => {
      await request(app.getHttpServer()).get('/api/deals').expect(401);
      await request(app.getHttpServer()).get('/api/wallet').expect(401);
    });

    it('o perfil público continua aberto a quem não está autenticado', async () => {
      await request(app.getHttpServer()).get('/api/profiles/nelsonbeats').expect(200);
    });
  });

  describe('o que a base de dados garante sozinha', () => {
    it('a aplicação não consegue alterar o razão (RN-101)', async () => {
      await percorrerCicloCompleto();

      await expect(
        prisma.$executeRawUnsafe('UPDATE ledger_entries SET amount_minor = 1'),
      ).rejects.toThrowError(/permission denied/i);
    });

    it('a aplicação não consegue apagar o razão', async () => {
      await percorrerCicloCompleto();

      await expect(
        prisma.$executeRawUnsafe('DELETE FROM ledger_entries'),
      ).rejects.toThrowError(/permission denied/i);
    });

    it('a aplicação não consegue apagar a auditoria', async () => {
      await percorrerCicloCompleto();

      await expect(
        prisma.$executeRawUnsafe('DELETE FROM audit_logs'),
      ).rejects.toThrowError(/permission denied/i);
    });

    it('a base recusa uma repartição que não fecha (RN-042)', async () => {
      const { dealId } = await percorrerCicloCompleto();

      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE deals SET platform_fee_minor = platform_fee_minor + 1 WHERE id = $1::uuid`,
          dealId,
        ),
      ).rejects.toThrowError(/deals_amount_split_balances/);
    });
  });

  describe('a entrada da aplicação (quem vai para onde)', () => {
    it('um criador tem perfil — o cliente encaminha-o para o painel', async () => {
      const resposta = await asCreator().get('/api/profiles/me').expect(200);

      expect(resposta.body.handle).toBe('nelsonbeats');
    });

    it('quem só compra recebe 404 — e vai para a sua área de comprador', async () => {
      await asBuyer().get('/api/profiles/me').expect(404);
    });

    it('sem sessão não se sabe quem é: 401, e o cliente manda entrar', async () => {
      await request(app.getHttpServer()).get('/api/profiles/me').expect(401);
    });

    it('o perfil próprio não revela o de outro criador', async () => {
      const resposta = await request(app.getHttpServer())
        .get('/api/profiles/me')
        .set('X-Dev-User', OUTSIDER_ID)
        .expect(404);

      expect(JSON.stringify(resposta.body)).not.toContain('nelsonbeats');
    });
  });

  describe('validação de entrada', () => {
    it('devolve todos os campos em falha de uma vez', async () => {
      const resposta = await asBuyer()
        .post('/api/deals')
        .send({ offerId: 'nao-e-uuid', brief: '' })
        .expect(400);

      expect(resposta.body.error).toBe('ValidationError');
      expect(resposta.body.issues.map((issue: { path: string }) => issue.path).sort()).toEqual([
        'brief',
        'offerId',
      ]);
    });

    it('exige a Idempotency-Key em operações de dinheiro', async () => {
      const criado = await asBuyer()
        .post('/api/deals')
        .send({ offerId, brief: 'Uma dedicatória.' })
        .expect(201);

      await asBuyer()
        .post(`/api/deals/${criado.body.id as string}/payments`)
        .send({ payerPhone: '+244923222222' })
        .expect(400);
    });

    it('recusa um telefone que não é angolano em E.164', async () => {
      const criado = await asBuyer()
        .post('/api/deals')
        .send({ offerId, brief: 'Uma dedicatória.' })
        .expect(201);

      await asBuyer()
        .post(`/api/deals/${criado.body.id as string}/payments`)
        .set('Idempotency-Key', 'k1')
        .send({ payerPhone: '923222222' })
        .expect(400);
    });
  });
});
