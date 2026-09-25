import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { BUYER_ID, CREATOR_ID, OUTSIDER_ID, seedFixtures } from './helpers/fixtures';
import { createTestApp, resetDatabase, type TestApp } from './helpers/test-app';

describe('F11 · mensagens directas gratuitas', () => {
  let harness: TestApp;
  let app: INestApplication;
  let prisma: PrismaClient;

  const as = (userId: string) => ({
    get: (url: string) => request(app.getHttpServer()).get(url).set('X-Dev-User', userId),
    post: (url: string) => request(app.getHttpServer()).post(url).set('X-Dev-User', userId),
  });

  beforeAll(async () => {
    harness = await createTestApp();
    app = harness.app;
    prisma = harness.prisma;
  });

  afterAll(async () => harness.close());

  beforeEach(async () => {
    await resetDatabase();
    await seedFixtures(prisma);
  });

  it('começa vazio e cria a conversa no primeiro envio', async () => {
    const before = await as(BUYER_ID).get('/api/profiles/nelsonbeats/direct-messages').expect(200);
    expect(before.body).toMatchObject({ id: null, messages: [], canSendFree: true });

    const sent = await as(BUYER_ID).post('/api/profiles/nelsonbeats/direct-messages')
      .send({ body: 'Olá, tens tempo esta semana?', clientId: 'browser-message-001' })
      .expect(201);

    expect(sent.body).toMatchObject({ viewerRole: 'buyer', canSendFree: false });
    expect(sent.body.messages).toHaveLength(1);
    expect(await prisma.directConversation.count()).toBe(1);
  });

  it('repete o mesmo clientId sem duplicar e trava outra mensagem na semana', async () => {
    const payload = { body: 'Olá!', clientId: 'browser-message-001' };
    await as(BUYER_ID).post('/api/profiles/nelsonbeats/direct-messages').send(payload).expect(201);
    await as(BUYER_ID).post('/api/profiles/nelsonbeats/direct-messages').send(payload).expect(201);
    await as(BUYER_ID).post('/api/profiles/nelsonbeats/direct-messages')
      .send({ body: 'Outra', clientId: 'browser-message-002' })
      .expect(422)
      .expect(({ body }) => expect(body.nextFreeAt).toBeTypeOf('string'));
    expect(await prisma.directMessage.count()).toBe(1);
  });

  it('deixa o criador responder e esconde a conversa de terceiros', async () => {
    const started = await as(BUYER_ID).post('/api/profiles/nelsonbeats/direct-messages')
      .send({ body: 'Olá!', clientId: 'browser-message-001' }).expect(201);
    const id = started.body.id as string;

    const reply = await as(CREATOR_ID).post(`/api/direct-conversations/${id}/messages`)
      .send({ body: 'Olá! Diz-me o que precisas.', clientId: 'creator-message-001' }).expect(201);
    expect(reply.body.messages).toHaveLength(2);
    await as(OUTSIDER_ID).get(`/api/direct-conversations/${id}`).expect(404);
  });

  it('serializa dois primeiros envios concorrentes e aceita apenas um', async () => {
    const first = as(BUYER_ID).post('/api/profiles/nelsonbeats/direct-messages')
      .send({ body: 'Primeira', clientId: 'parallel-message-001' });
    const second = as(BUYER_ID).post('/api/profiles/nelsonbeats/direct-messages')
      .send({ body: 'Segunda', clientId: 'parallel-message-002' });
    const responses = await Promise.all([first, second]);

    expect(responses.map(response => response.status).sort()).toEqual([201, 422]);
    expect(await prisma.directMessage.count()).toBe(1);
  });
});
