import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { BUYER_ID, CREATOR_ID, OUTSIDER_ID, seedFixtures } from './helpers/fixtures';
import {
  createTestApp,
  ownerPrisma,
  resetDatabase,
  type TestApp,
} from './helpers/test-app';

const HORA = 60 * 60 * 1000;

/**
 * A verificação de F7 contra Postgres real.
 *
 * Duas das regras desta fatia não se testam com duplos porque não são da
 * aplicação: a não sobreposição de janelas é uma restrição `EXCLUDE`, e a
 * disputa pela última vaga resolve-se com um `UPDATE` condicionado. Uma
 * verificação em aplicação perderia as duas corridas por construção.
 */
describe('F7 · disponibilidade, vagas e agendamento', () => {
  let harness: TestApp;
  let app: INestApplication;
  let prisma: PrismaClient;
  let bookingOfferId: string;
  let creatorProfileId: string;

  const as = (userId: string) => ({
    get: (url: string) => request(app.getHttpServer()).get(url).set('X-Dev-User', userId),
    post: (url: string) => request(app.getHttpServer()).post(url).set('X-Dev-User', userId),
    delete: (url: string) => request(app.getHttpServer()).delete(url).set('X-Dev-User', userId),
  });

  const asCreator = () => as(CREATOR_ID);
  const asBuyer = () => as(BUYER_ID);

  beforeAll(async () => {
    harness = await createTestApp();
    app = harness.app;
    prisma = harness.prisma;
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await resetDatabase();
    creatorProfileId = (await seedFixtures(prisma)).creatorProfileId;

    const offer = await prisma.offer.create({
      data: {
        profileId: creatorProfileId,
        kind: 'BOOKING',
        title: 'Sessão de estúdio',
        priceMinor: 5_000_000n,
        currency: 'AOA',
        slaHours: 48,
        revisionsIncluded: 0,
        requiresBrief: true,
      },
    });

    bookingOfferId = offer.id;
  });

  const daquiA = (horas: number) => new Date(Date.now() + horas * HORA).toISOString();

  const abrirJanela = (inicio: number, fim: number, slotsTotal = 1) =>
    asCreator()
      .post('/api/availability')
      .send({ offerId: bookingOfferId, startsAt: daquiA(inicio), endsAt: daquiA(fim), slotsTotal });

  describe('RN-033 · janelas não se sobrepõem', () => {
    it('a recusa vem do Postgres, não de uma verificação em aplicação', async () => {
      await abrirJanela(24, 26).expect(201);

      // Inserção directa pelo papel dono, a contornar a aplicação inteira: se
      // a regra estivesse só no caso de uso, esta linha passava.
      const owner = ownerPrisma();

      await expect(
        owner.$executeRawUnsafe(
          `INSERT INTO availability_windows
             (id, profile_id, offer_id, starts_at, ends_at, slots_total, updated_at)
           VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::timestamptz, $4::timestamptz, 1, NOW())`,
          creatorProfileId,
          bookingOfferId,
          daquiA(25),
          daquiA(27),
        ),
      ).rejects.toThrow(/availability_windows_no_overlap/);
    });

    it('pela API devolve 422, com a mensagem do domínio', async () => {
      await abrirJanela(24, 26).expect(201);

      await abrirJanela(25, 27).expect(422);
      expect(await prisma.availabilityWindow.count()).toBe(1);
    });

    it('duas janelas encostadas passam: o fim do intervalo é aberto', async () => {
      await abrirJanela(24, 26).expect(201);
      await abrirJanela(26, 28).expect(201);

      expect(await prisma.availabilityWindow.count()).toBe(2);
    });

    it('janelas sobrepostas em ofertas diferentes não colidem', async () => {
      const outra = await prisma.offer.create({
        data: {
          profileId: creatorProfileId,
          kind: 'BOOKING',
          title: 'Aula',
          priceMinor: 1_000_000n,
          currency: 'AOA',
          slaHours: 24,
          revisionsIncluded: 0,
          requiresBrief: false,
        },
      });

      await abrirJanela(24, 26).expect(201);

      await asCreator()
        .post('/api/availability')
        .send({ offerId: outra.id, startsAt: daquiA(24), endsAt: daquiA(26), slotsTotal: 1 })
        .expect(201);
    });
  });

  describe('RN-034 · a corrida pela última vaga', () => {
    it('dois compradores, uma vaga: um Deal criado, o outro 409', async () => {
      const janela = await abrirJanela(24, 26, 1).expect(201);

      const contratar = (userId: string) =>
        as(userId)
          .post('/api/deals')
          .send({
            offerId: bookingOfferId,
            brief: 'Quero esta vaga.',
            availabilityWindowId: janela.body.id as string,
          });

      const respostas = await Promise.allSettled([
        contratar(BUYER_ID),
        contratar(OUTSIDER_ID),
      ]);

      const criados = respostas.filter(
        (r) => r.status === 'fulfilled' && r.value.status === 201,
      );
      const recusados = respostas.filter(
        (r) => r.status === 'fulfilled' && r.value.status === 409,
      );

      expect(criados).toHaveLength(1);
      expect(recusados).toHaveLength(1);
      expect(await prisma.deal.count()).toBe(1);

      const depois = await prisma.availabilityWindow.findUniqueOrThrow({
        where: { id: janela.body.id as string },
      });
      expect(depois.slotsTaken).toBe(1);
    });

    it('as vagas nunca passam o total, nem por escrita directa (RN-031)', async () => {
      const janela = await abrirJanela(24, 26, 1).expect(201);
      const owner = ownerPrisma();

      await expect(
        owner.$executeRawUnsafe(
          `UPDATE availability_windows SET slots_taken = 2 WHERE id = $1::uuid`,
          janela.body.id as string,
        ),
      ).rejects.toThrow(/availability_windows_slots_within_total/);
    });

    it('com duas vagas, os dois compradores entram', async () => {
      const janela = await abrirJanela(24, 26, 2).expect(201);

      const contratar = (userId: string) =>
        as(userId)
          .post('/api/deals')
          .send({
            offerId: bookingOfferId,
            brief: 'Quero esta vaga.',
            availabilityWindowId: janela.body.id as string,
          });

      await Promise.all([contratar(BUYER_ID), contratar(OUTSIDER_ID)]);

      expect(await prisma.deal.count()).toBe(2);
    });
  });

  describe('a vaga volta quando o pedido morre', () => {
    it('recusado, a vaga volta e o estado deixa de ser NO_SLOTS', async () => {
      const janela = await abrirJanela(24, 26, 1).expect(201);

      const criado = await asBuyer()
        .post('/api/deals')
        .send({
          offerId: bookingOfferId,
          brief: 'Sessão de sábado.',
          availabilityWindowId: janela.body.id as string,
        })
        .expect(201);

      const esgotado = await request(app.getHttpServer())
        .get('/api/profiles/nelsonbeats')
        .expect(200);
      expect(esgotado.body.availabilityStatus).toBe('NO_SLOTS');

      await asCreator()
        .post(`/api/deals/${criado.body.id as string}/decline`)
        .send({})
        .expect(201);

      const depois = await prisma.availabilityWindow.findUniqueOrThrow({
        where: { id: janela.body.id as string },
      });
      expect(depois.slotsTaken).toBe(0);

      const livre = await request(app.getHttpServer())
        .get('/api/profiles/nelsonbeats')
        .expect(200);
      expect(livre.body.availabilityStatus).toBe('AVAILABLE');
    });
  });

  describe('o estado derivado', () => {
    it('NO_SLOTS não está guardado: vem sempre das janelas', async () => {
      const janela = await abrirJanela(24, 26, 1).expect(201);

      await asBuyer()
        .post('/api/deals')
        .send({
          offerId: bookingOfferId,
          brief: 'Sessão de sábado.',
          availabilityWindowId: janela.body.id as string,
        })
        .expect(201);

      const publico = await request(app.getHttpServer())
        .get('/api/profiles/nelsonbeats')
        .expect(200);

      expect(publico.body.availabilityStatus).toBe('NO_SLOTS');

      // A coluna continua a dizer AVAILABLE — o derivado nunca foi escrito.
      const guardado = await prisma.profile.findUniqueOrThrow({
        where: { id: creatorProfileId },
      });
      expect(guardado.availabilityStatus).toBe('AVAILABLE');
    });

    it('pausar tem precedência sobre as vagas', async () => {
      await abrirJanela(24, 26, 5).expect(201);

      await request(app.getHttpServer())
        .patch('/api/profiles/me')
        .set('X-Dev-User', CREATOR_ID)
        .send({ availabilityStatus: 'PAUSED' })
        .expect(200);

      const publico = await request(app.getHttpServer())
        .get('/api/profiles/nelsonbeats')
        .expect(200);

      expect(publico.body.availabilityStatus).toBe('PAUSED');
    });
  });

  describe('gerir a agenda', () => {
    it('apagar uma janela reservada devolve 409', async () => {
      const janela = await abrirJanela(24, 26, 1).expect(201);

      await asBuyer()
        .post('/api/deals')
        .send({
          offerId: bookingOfferId,
          brief: 'Sessão de sábado.',
          availabilityWindowId: janela.body.id as string,
        })
        .expect(201);

      await asCreator().delete(`/api/availability/${janela.body.id as string}`).expect(409);
    });

    it('a agenda de outro criador não é alcançável — 404', async () => {
      const janela = await abrirJanela(24, 26, 1).expect(201);

      await as(OUTSIDER_ID)
        .delete(`/api/availability/${janela.body.id as string}`)
        .expect(404);
    });

    it('as vagas de uma oferta são públicas', async () => {
      await abrirJanela(24, 26, 3).expect(201);

      const { body } = await request(app.getHttpServer())
        .get(`/api/offers/${bookingOfferId}/availability`)
        .expect(200);

      expect(body.data).toHaveLength(1);
      expect(body.data[0].slotsFree).toBe(3);
    });
  });
});
