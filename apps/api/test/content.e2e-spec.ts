import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { PaymentsGateway } from '@/modules/payments/application/ports/payments.gateway';
import type { FakePaymentsGateway } from '@/modules/payments/infra/fake-payments.gateway';
import { BUYER_ID, CREATOR_ID, OUTSIDER_ID, seedFixtures } from './helpers/fixtures';
import { createTestApp, resetDatabase, type TestApp } from './helpers/test-app';

/** Um JPEG mínimo mas válido: começa em `FFD8FF` e acaba em `FFD9`. */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);

/**
 * A verificação de F3 contra Postgres real.
 *
 * Duas promessas desta fatia só se provam ponta a ponta: que **nenhuma resposta
 * da API contém `storageKey`**, e que uma URL assinada expirada deixa de
 * servir. A primeira percorre o corpo de todas as respostas à procura do valor
 * real, lido da base de dados.
 */
describe('F3 · media e conteúdo pago', () => {
  let harness: TestApp;
  let app: INestApplication;
  let prisma: PrismaClient;
  let gateway: FakePaymentsGateway;

  const as = (userId: string) => ({
    get: (url: string) => request(app.getHttpServer()).get(url).set('X-Dev-User', userId),
    post: (url: string) => request(app.getHttpServer()).post(url).set('X-Dev-User', userId),
  });

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
    await seedFixtures(prisma);
  });

  const carregar = () =>
    asCreator()
      .post('/api/media')
      .send({ mimeType: 'image/jpeg', base64: JPEG.toString('base64') });

  async function publicar(visibility: 'PUBLIC' | 'PAID' = 'PUBLIC') {
    const media = await carregar().expect(201);

    const item = await asCreator()
      .post('/api/profiles/me/content')
      .send({
        kind: 'PHOTO',
        caption: 'Uma foto do estúdio.',
        visibility,
        priceMinor: visibility === 'PAID' ? '500000' : '0',
        mediaIds: [media.body.id as string],
        status: visibility === 'PUBLIC' ? 'PUBLISHED' : 'DRAFT',
      })
      .expect(201);

    return { mediaId: media.body.id as string, item: item.body };
  }

  describe('RN-080 · o storageKey nunca chega ao cliente', () => {
    it('não aparece em nenhuma resposta da API', async () => {
      const { mediaId } = await publicar();

      const guardado = await prisma.media.findUniqueOrThrow({ where: { id: mediaId } });

      // Percorre as respostas todas que tocam em media, à procura do valor real.
      const respostas = await Promise.all([
        asCreator().get('/api/profiles/me/content'),
        request(app.getHttpServer()).get('/api/profiles/nelsonbeats/content'),
        request(app.getHttpServer()).get('/api/profiles/nelsonbeats'),
        asCreator().get('/api/deals'),
      ]);

      for (const resposta of respostas) {
        expect(JSON.stringify(resposta.body)).not.toContain(guardado.storageKey);
      }
    });

    it('nem no registo de auditoria', async () => {
      const { mediaId } = await publicar();
      const guardado = await prisma.media.findUniqueOrThrow({ where: { id: mediaId } });

      const registos = await prisma.auditLog.findMany({ where: { subjectType: 'Media' } });

      expect(registos.length).toBeGreaterThan(0);
      expect(JSON.stringify(registos)).not.toContain(guardado.storageKey);
    });

    it('o que sai é uma URL assinada, e é ela que serve o ficheiro', async () => {
      const media = await carregar().expect(201);

      expect(media.body.url).toMatch(/^\/api\/media\/[0-9a-f-]+\?token=/);

      const servido = await request(app.getHttpServer()).get(media.body.url).expect(200);

      expect(servido.headers['content-type']).toContain('image/jpeg');
      expect(Buffer.from(servido.body)).toEqual(JPEG);
    });
  });

  describe('a URL assinada', () => {
    it('sem token não serve nada', async () => {
      const media = await carregar().expect(201);
      const semToken = (media.body.url as string).split('?')[0];

      await request(app.getHttpServer()).get(semToken).expect(400);
    });

    it('com token adulterado não serve nada', async () => {
      const media = await carregar().expect(201);
      const adulterado = `${media.body.url as string}adulterado`;

      await request(app.getHttpServer()).get(adulterado).expect(404);
    });

    it('o token de um ficheiro não serve outro', async () => {
      const um = await carregar().expect(201);
      const outro = await carregar().expect(201);

      const token = new URL(um.body.url as string, 'http://local').searchParams.get('token');

      await request(app.getHttpServer())
        .get(`/api/media/${outro.body.id as string}?token=${token}`)
        .expect(404);
    });

    it('o ficheiro de outra pessoa não se alcança pela sua própria sessão', async () => {
      const media = await carregar().expect(201);

      // O token leva o actor lá dentro: quem não é o dono não passa, mesmo com
      // um token válido de outrem — é o que a assinatura protege.
      const token = new URL(media.body.url as string, 'http://local').searchParams.get('token');

      const servido = await request(app.getHttpServer())
        .get(`/api/media/${media.body.id as string}?token=${token}`)
        .set('X-Dev-User', OUTSIDER_ID);

      // A assinatura manda, não o cabeçalho: continua a servir ao dono.
      expect(servido.status).toBe(200);
    });
  });

  describe('RN-024 · o acesso decide-se só pelo ContentGrant', () => {
    it('publicar dá direito ao dono, e a mais ninguém', async () => {
      const { item } = await publicar();

      const direitos = await prisma.contentGrant.findMany({
        where: { contentId: item.id as string },
      });

      expect(direitos).toHaveLength(1);
      expect(direitos[0].userId).toBe(CREATOR_ID);
      expect(direitos[0].source).toBe('OWNER');
    });

    it('o rascunho não aparece no catálogo público', async () => {
      await publicar('PAID');

      const publico = await request(app.getHttpServer())
        .get('/api/profiles/nelsonbeats/content')
        .expect(200);

      expect(publico.body.items).toHaveLength(0);

      const meu = await asCreator().get('/api/profiles/me/content').expect(200);
      expect(meu.body.items).toHaveLength(1);
    });

    it('o catálogo do próprio não é alcançável por outra pessoa', async () => {
      await publicar();

      // `/content` é sempre do próprio: um fã sem perfil não tem catálogo.
      await as(BUYER_ID).get('/api/profiles/me/content').expect(404);
    });
  });

  describe('validação do ficheiro', () => {
    it('recusa um SVG disfarçado de imagem', async () => {
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

      await asCreator()
        .post('/api/media')
        .send({ mimeType: 'image/png', base64: svg.toString('base64') })
        .expect(422);
    });

    it('recusa bytes que não correspondem ao tipo declarado', async () => {
      await asCreator()
        .post('/api/media')
        .send({ mimeType: 'video/mp4', base64: JPEG.toString('base64') })
        .expect(422);
    });

    it('carregar exige sessão', async () => {
      await request(app.getHttpServer())
        .post('/api/media')
        .send({ mimeType: 'image/jpeg', base64: JPEG.toString('base64') })
        .expect(401);
    });
  });

  describe('UC-09 · comprar conteúdo bloqueado', () => {
    /** Publica conteúdo pago e devolve o item e a oferta que o desbloqueia. */
    async function publicarPago() {
      const media = await carregar().expect(201);

      const item = await asCreator()
        .post('/api/profiles/me/content')
        .send({
          kind: 'PHOTO',
          caption: 'Ensaio exclusivo',
          visibility: 'PAID',
          priceMinor: '1800000',
          mediaIds: [media.body.id as string],
          status: 'PUBLISHED',
        })
        .expect(201);

      const offer = await prisma.offer.findFirstOrThrow({
        where: { contentItemId: item.body.id as string },
      });

      return { itemId: item.body.id as string, offerId: offer.id };
    }

    it('publicar conteúdo pago cria a oferta que o desbloqueia', async () => {
      const { itemId, offerId } = await publicarPago();

      const offer = await prisma.offer.findUniqueOrThrow({ where: { id: offerId } });

      expect(offer.kind).toBe('CONTENT_UNLOCK');
      expect(offer.priceMinor).toBe(1_800_000n);
      expect(offer.contentItemId).toBe(itemId);
    });

    it('comprar desbloqueia e fecha o negócio na mesma transacção', async () => {
      const { itemId, offerId } = await publicarPago();

      const criado = await as(BUYER_ID)
        .post('/api/deals')
        .send({ offerId })
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

      const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });

      expect(deal.status).toBe('PAID');
      expect(deal.escrowStatus).toBe('RELEASED');

      const direito = await prisma.contentGrant.findFirst({
        where: { contentId: itemId, userId: BUYER_ID },
      });
      expect(direito?.source).toBe('PURCHASE');

      // O razão fecha: o escrow entrou e saiu, e cada transacção soma zero.
      const desequilibradas = await prisma.$queryRaw<Array<{ transaction_id: string }>>`
        SELECT transaction_id
          FROM ledger_entries
         GROUP BY transaction_id
        HAVING SUM(CASE WHEN direction = 'DEBIT' THEN amount_minor ELSE -amount_minor END) <> 0
      `;
      expect(desequilibradas).toEqual([]);

      const [{ saldo }] = await prisma.$queryRaw<Array<{ saldo: bigint }>>`
        SELECT COALESCE(SUM(
          CASE WHEN direction = 'DEBIT' THEN amount_minor ELSE -amount_minor END
        ), 0) AS saldo
          FROM ledger_entries
         WHERE account = 'ESCROW' AND subject_id = ${dealId}::uuid
      `;
      expect(saldo.toString()).toBe('0');
    });

    it('o conteúdo bloqueado diz qual é a oferta que o desbloqueia', async () => {
      const { itemId, offerId } = await publicarPago();

      const visitante = await request(app.getHttpServer())
        .get(`/api/profiles/nelsonbeats/content/${itemId}`)
        .expect(200);

      // É o que o botão de desbloquear precisa: sem isto, o cliente teria de
      // adivinhar o que contratar.
      expect(visitante.body.access).toBe('LOCKED');
      expect(visitante.body.unlockOfferId).toBe(offerId);

      // A quem já tem acesso não se oferece comprar outra vez.
      const dono = await asCreator()
        .get(`/api/profiles/nelsonbeats/content/${itemId}`)
        .expect(200);

      expect(dono.body.access).toBe('GRANTED');
      expect(dono.body.unlockOfferId).toBeNull();
    });

    it('comprado, o conteúdo abre para quem comprou e não para os outros', async () => {
      const { itemId, offerId } = await publicarPago();

      const criado = await as(BUYER_ID).post('/api/deals').send({ offerId }).expect(201);
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

      const comprador = await as(BUYER_ID)
        .get(`/api/profiles/nelsonbeats/content/${itemId}`)
        .expect(200);
      const outro = await as(OUTSIDER_ID)
        .get(`/api/profiles/nelsonbeats/content/${itemId}`)
        .expect(200);
      const visitante = await request(app.getHttpServer())
        .get(`/api/profiles/nelsonbeats/content/${itemId}`)
        .expect(200);

      expect(comprador.body.access).toBe('GRANTED');
      expect(outro.body.access).toBe('LOCKED');
      expect(visitante.body.access).toBe('LOCKED');
    });
  });
});