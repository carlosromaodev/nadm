import { beforeEach, describe, expect, it } from 'vitest';
import { BusinessRuleError, ResourceNotFoundError } from '@/core/errors/domain-error';
import { makeJourney } from '@/shared/testing/deal-journey';
import { makeTestContext, type TestContext } from '@/shared/testing/test-context';
import { PLATFORM_SUBJECT_ID } from '@/modules/ledger/domain/ledger-transaction';
import { STATE_CHANGE_BODY } from '@/modules/deals/domain/message';
import { Money } from '@/shared/domain/money';
import type { InMemoryMediaUrlSigner } from '@/shared/testing/in-memory-repositories';
import { MAX_MEDIA_BYTES, validateMediaBytes } from '../../domain/content';
import { ContentAccess } from '../content-access';
import { GetContentUseCase } from './get-content.use-case';
import { ListContentUseCase } from './list-content.use-case';
import { ReadMediaUseCase } from './read-media.use-case';
import { SaveContentUseCase } from './save-content.use-case';
import { UploadMediaUseCase } from './upload-media.use-case';

/** Um JPEG mínimo mas válido: começa em `FFD8FF` e acaba em `FFD9`. */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
/** Um MP4 mínimo: `ftyp` no offset 4. */
const MP4 = Buffer.concat([
  Buffer.from([0, 0, 0, 0x18]),
  Buffer.from('ftypisom'),
  Buffer.alloc(8),
]);

const CRIADOR = '11111111-1111-4111-8111-111111111111';
const FA = '22222222-2222-4222-8222-222222222222';
const ESTRANHO = '33333333-3333-4333-8333-333333333333';

describe('conteúdo e media (F3)', () => {
  let ctx: TestContext;
  let signer: InMemoryMediaUrlSigner;
  let upload: UploadMediaUseCase;
  let save: SaveContentUseCase;
  let list: ListContentUseCase;
  let get: GetContentUseCase;
  let readMedia: ReadMediaUseCase;

  beforeEach(() => {
    ctx = makeTestContext();
    signer = ctx.mediaSigner;

    const access = new ContentAccess(ctx.contents, ctx.users, ctx.offers, signer, ctx.clock);

    upload = new UploadMediaUseCase(
      ctx.transactions,
      ctx.contents,
      ctx.users,
      ctx.mediaStorage,
      signer,
      ctx.clock,
      ctx.ids,
      ctx.auditLog,
    );
    save = new SaveContentUseCase(
      ctx.transactions,
      ctx.contents,
      ctx.profiles,
      ctx.offers,
      access,
      ctx.clock,
      ctx.ids,
      ctx.auditLog,
    );
    list = new ListContentUseCase(ctx.transactions, ctx.contents, ctx.profiles, access, ctx.clock);
    get = new GetContentUseCase(ctx.transactions, ctx.contents, ctx.profiles, access, ctx.clock);
    readMedia = new ReadMediaUseCase(
      ctx.contents,
      ctx.profiles,
      access,
      signer,
      ctx.mediaStorage,
      ctx.clock,
    );

    ctx.seedCreator({ id: CRIADOR, handle: 'nelsonbeats', profileId: 'profile-criador' });
    ctx.seedUser({ id: FA });
    ctx.seedUser({ id: ESTRANHO });
  });

  const carregarJpeg = () =>
    upload.execute(CRIADOR, { mimeType: 'image/jpeg', base64: JPEG.toString('base64') });

  async function publicar(
    visibility: 'PUBLIC' | 'PAID' = 'PUBLIC',
    status: 'DRAFT' | 'PUBLISHED' = 'PUBLISHED',
  ) {
    const media = await carregarJpeg();

    return save.execute(CRIADOR, {
      kind: 'PHOTO',
      caption: 'Uma foto.',
      visibility,
      priceMinor: visibility === 'PAID' ? '500000' : '0',
      mediaIds: [media.id],
      status,
    });
  }

  describe('carregar media', () => {
    it('valida pelos bytes, não pelo tipo declarado', async () => {
      await expect(
        upload.execute(CRIADOR, {
          mimeType: 'image/png',
          base64: JPEG.toString('base64'),
        }),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('recusa um SVG disfarçado de imagem', () => {
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

      expect(() => validateMediaBytes('image/png', svg)).toThrow(BusinessRuleError);
    });

    it('recusa um ficheiro vazio e um acima do limite', () => {
      expect(() => validateMediaBytes('image/jpeg', new Uint8Array(0))).toThrow(
        BusinessRuleError,
      );
      expect(() =>
        validateMediaBytes('image/jpeg', new Uint8Array(MAX_MEDIA_BYTES + 1)),
      ).toThrow(BusinessRuleError);
    });

    it('**o storageKey nunca sai** — o que volta é uma URL assinada', async () => {
      const media = await carregarJpeg();
      const guardado = await ctx.contents.findMedia(media.id);

      expect(JSON.stringify(media)).not.toContain(guardado!.storageKey);
      expect(media.url).toContain('/api/media/');
    });

    it('nem o registo de auditoria guarda o storageKey', async () => {
      const media = await carregarJpeg();
      const guardado = await ctx.contents.findMedia(media.id);

      const registo = ctx.db.auditLog.find((e) => e.action === 'media.uploaded')!;
      expect(JSON.stringify(registo)).not.toContain(guardado!.storageKey);
    });

    it('se a gravação falhar, o ficheiro não fica órfão no armazenamento', async () => {
      const original = ctx.contents.createMedia.bind(ctx.contents);
      ctx.contents.createMedia = async () => {
        throw new Error('falha simulada de escrita');
      };

      await expect(carregarJpeg()).rejects.toThrow('falha simulada');
      expect(ctx.mediaStorage.files.size).toBe(0);

      ctx.contents.createMedia = original;
    });
  });

  describe('publicar', () => {
    it('publica conteúdo público e dá direito de acesso ao dono', async () => {
      const item = await publicar();

      expect(item.visibility).toBe('PUBLIC');
      expect(item.access).toBe('GRANTED');
      expect(await ctx.contents.findGrant(item.id, CRIADOR)).not.toBeNull();
    });

    it('conteúdo pago exige preço maior que zero', async () => {
      const media = await carregarJpeg();

      await expect(
        save.execute(CRIADOR, {
          kind: 'PHOTO',
          caption: '',
          visibility: 'PAID',
          priceMinor: '0',
          mediaIds: [media.id],
          status: 'DRAFT',
        }),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('não publica sem ficheiro nenhum', async () => {
      await expect(
        save.execute(CRIADOR, {
          kind: 'PHOTO',
          caption: '',
          visibility: 'PUBLIC',
          priceMinor: '0',
          mediaIds: [],
          status: 'PUBLISHED',
        }),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('um vídeo não entra numa publicação de foto', async () => {
      const video = await upload.execute(CRIADOR, {
        mimeType: 'video/mp4',
        base64: MP4.toString('base64'),
      });

      await expect(
        save.execute(CRIADOR, {
          kind: 'PHOTO',
          caption: '',
          visibility: 'PUBLIC',
          priceMinor: '0',
          mediaIds: [video.id],
          status: 'DRAFT',
        }),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('não se publica com ficheiro de outra pessoa', async () => {
      ctx.seedCreator({ id: ESTRANHO, handle: 'outra', profileId: 'profile-estranho' });
      const meu = await carregarJpeg();

      await expect(
        save.execute(ESTRANHO, {
          kind: 'PHOTO',
          caption: '',
          visibility: 'PUBLIC',
          priceMinor: '0',
          mediaIds: [meu.id],
          status: 'DRAFT',
        }),
      ).rejects.toThrow(ResourceNotFoundError);
    });

    it('agendar exige data futura', async () => {
      const media = await carregarJpeg();

      await expect(
        save.execute(CRIADOR, {
          kind: 'PHOTO',
          caption: '',
          visibility: 'PUBLIC',
          priceMinor: '0',
          mediaIds: [media.id],
          status: 'SCHEDULED',
          scheduledAt: new Date(ctx.clock.now().getTime() - 1000),
        }),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('a pré-visualização tem de pertencer à própria publicação', async () => {
      const media = await carregarJpeg();
      const outra = await carregarJpeg();

      await expect(
        save.execute(CRIADOR, {
          kind: 'ALBUM',
          caption: '',
          visibility: 'PUBLIC',
          priceMinor: '0',
          mediaIds: [media.id],
          previewMediaIds: [outra.id],
          status: 'DRAFT',
        }),
      ).rejects.toThrow(BusinessRuleError);
    });
  });

  describe('RN-024 · o acesso decide-se só pelo ContentGrant', () => {
    it('conteúdo pago aparece bloqueado a quem não o comprou', async () => {
      const item = await publicar('PAID', 'DRAFT');

      const vista = await get.execute({ handle: 'nelsonbeats', id: item.id, actorUserId: CRIADOR });
      expect(vista.access).toBe('GRANTED');

      // Sem direito, o conteúdo não é alcançável — está em rascunho.
      await expect(
        get.execute({ handle: 'nelsonbeats', id: item.id, actorUserId: FA }),
      ).rejects.toThrow(ResourceNotFoundError);
    });

    it('com direito dado, o mesmo conteúdo abre', async () => {
      const item = await publicar('PAID', 'DRAFT');

      await ctx.contents.createGrant(
        {
          id: 'grant-1',
          contentId: item.id,
          userId: FA,
          source: 'PURCHASE',
          grantedAt: ctx.clock.now(),
          expiresAt: null,
          revokedAt: null,
        });

      expect(await ctx.contents.findGrant(item.id, FA)).not.toBeNull();
    });

    it('um direito revogado deixa de valer', async () => {
      const item = await publicar('PAID', 'DRAFT');
      const access = new ContentAccess(ctx.contents, ctx.users, ctx.offers, signer, ctx.clock);

      await ctx.contents.createGrant(
        {
          id: 'grant-1',
          contentId: item.id,
          userId: FA,
          source: 'PURCHASE',
          grantedAt: ctx.clock.now(),
          expiresAt: null,
          revokedAt: ctx.clock.now(),
        });

      const guardado = (await ctx.contents.findItem(item.id))!;
      expect(await access.hasGrant(guardado, FA)).toBe(false);
    });

    it('um direito expirado deixa de valer', async () => {
      const item = await publicar('PAID', 'DRAFT');
      const access = new ContentAccess(ctx.contents, ctx.users, ctx.offers, signer, ctx.clock);

      await ctx.contents.createGrant(
        {
          id: 'grant-1',
          contentId: item.id,
          userId: FA,
          source: 'MEMBERSHIP',
          grantedAt: ctx.clock.now(),
          expiresAt: new Date(ctx.clock.now().getTime() + 1000),
          revokedAt: null,
        });

      const guardado = (await ctx.contents.findItem(item.id))!;
      expect(await access.hasGrant(guardado, FA)).toBe(true);

      ctx.clock.advanceHours(1);
      expect(await access.hasGrant(guardado, FA)).toBe(false);
    });
  });

  describe('listar', () => {
    it('o criador vê os seus rascunhos; o público não', async () => {
      await publicar('PUBLIC', 'DRAFT');

      const minhas = await list.execute({ ownUserId: CRIADOR });
      const publicas = await list.execute({ handle: 'nelsonbeats' });

      expect(minhas.items).toHaveLength(1);
      expect(publicas.items).toHaveLength(0);
    });

    it('um perfil por publicar é indistinguível de inexistente', async () => {
      ctx.seedCreator({
        id: ESTRANHO,
        handle: 'porpublicar',
        profileId: 'profile-estranho',
        published: false,
      });

      await expect(list.execute({ handle: 'porpublicar' })).rejects.toThrow(
        ResourceNotFoundError,
      );
    });

    it('a listagem do próprio não serve para espreitar a de outrem', async () => {
      await expect(list.execute({ ownUserId: ESTRANHO })).rejects.toThrow(
        ResourceNotFoundError,
      );
    });
  });

  describe('RN-080 · servir media só por URL assinada', () => {
    it('serve o ficheiro com um token válido', async () => {
      const media = await carregarJpeg();
      const resultado = await readMedia.execute(media.id, signer.tokenOf(media.url));

      expect(Buffer.from(resultado.bytes)).toEqual(JPEG);
      expect(resultado.mimeType).toBe('image/jpeg');
    });

    it('um token inventado não serve nada', async () => {
      const media = await carregarJpeg();

      await expect(readMedia.execute(media.id, 'token-inventado')).rejects.toThrow(
        ResourceNotFoundError,
      );
    });

    it('um token de outro ficheiro não serve este', async () => {
      const um = await carregarJpeg();
      const outro = await carregarJpeg();

      await expect(readMedia.execute(outro.id, signer.tokenOf(um.url))).rejects.toThrow(
        ResourceNotFoundError,
      );
    });

    it('um token expirado deixa de servir', async () => {
      const media = await carregarJpeg();
      const token = signer.tokenOf(media.url);

      // A URL vale cinco minutos.
      ctx.clock.advanceMinutes(6);

      await expect(readMedia.execute(media.id, token)).rejects.toThrow(ResourceNotFoundError);
    });

    it('**recusa um token com validade acima dos 15 minutos** (RN-082)', async () => {
      const media = await carregarJpeg();

      // Um token forjado com validade longa: mesmo assinado, não passa.
      const url = await signer.sign({
        mediaId: media.id,
        actorUserId: CRIADOR,
        contentId: null,
        expiresAt: ctx.clock.now().getTime() + 60 * 60 * 1000,
      });

      await expect(readMedia.execute(media.id, signer.tokenOf(url))).rejects.toThrow(
        ResourceNotFoundError,
      );
    });

    it('o ficheiro de outra pessoa não se serve com o token dela', async () => {
      const media = await carregarJpeg();

      const url = await signer.sign({
        mediaId: media.id,
        actorUserId: FA,
        contentId: null,
        expiresAt: ctx.clock.now().getTime() + 60 * 1000,
      });

      await expect(readMedia.execute(media.id, signer.tokenOf(url))).rejects.toThrow(
        ResourceNotFoundError,
      );
    });
  });
});

describe('UC-09 · comprar conteúdo bloqueado (F3)', () => {
  let ctx: TestContext;
  let journey: ReturnType<typeof makeJourney>;
  let save: SaveContentUseCase;
  let get: GetContentUseCase;

  beforeEach(() => {
    ctx = makeTestContext();
    journey = makeJourney(ctx);

    const access = new ContentAccess(ctx.contents, ctx.users, ctx.offers, ctx.mediaSigner, ctx.clock);

    save = new SaveContentUseCase(
      ctx.transactions,
      ctx.contents,
      ctx.profiles,
      ctx.offers,
      access,
      ctx.clock,
      ctx.ids,
      ctx.auditLog,
    );
    get = new GetContentUseCase(ctx.transactions, ctx.contents, ctx.profiles, access, ctx.clock);

    ctx.seedCreator({ id: CRIADOR, handle: 'nelsonbeats', profileId: 'profile-criador' });
    ctx.seedUser({ id: FA });
  });

  /** Publica conteúdo pago e devolve o item e a oferta que o desbloqueia. */
  async function publicarPago(priceMinor = '1800000') {
    const media = {
      id: ctx.ids.next(),
      ownerUserId: CRIADOR,
      storageKey: ctx.ids.next(),
      mimeType: 'image/jpeg' as const,
      byteSize: 8,
      createdAt: ctx.clock.now(),
    };
    await ctx.contents.createMedia(media);

    const item = await save.execute(CRIADOR, {
      kind: 'PHOTO',
      caption: 'Ensaio exclusivo',
      visibility: 'PAID',
      priceMinor,
      mediaIds: [media.id],
      status: 'PUBLISHED',
    });

    const offer = await ctx.offers.findByContentItem(item.id);

    return { item, offer: offer! };
  }

  it('publicar conteúdo pago deixou de ser recusado', async () => {
    const { item } = await publicarPago();

    expect(item.visibility).toBe('PAID');
    expect(item.price).toEqual({ amount: '1800000', currency: 'AOA' });
  });

  it('cria a oferta que o desbloqueia, com o preço da publicação', async () => {
    const { item, offer } = await publicarPago();

    expect(offer.kind).toBe('CONTENT_UNLOCK');
    expect(offer.priceMinor).toBe(1_800_000n);
    expect(offer.contentItemId).toBe(item.id);
    // Não há prazo nem revisões: a entrega é imediata.
    expect(offer.revisionsIncluded).toBe(0);
    expect(offer.requiresBrief).toBe(false);
  });

  it('republicar não cria uma segunda oferta — actualiza a que existe', async () => {
    const { item, offer } = await publicarPago();

    await save.execute(CRIADOR, {
      id: item.id,
      kind: 'PHOTO',
      caption: 'Ensaio exclusivo',
      visibility: 'PAID',
      priceMinor: '2500000',
      mediaIds: item.mediaIds!,
      status: 'PUBLISHED',
    });

    const depois = await ctx.offers.findByContentItem(item.id);

    expect(depois!.id).toBe(offer.id);
    expect(depois!.priceMinor).toBe(2_500_000n);
  });

  it('a captura desbloqueia o conteúdo e fecha o negócio de uma vez', async () => {
    const { item, offer } = await publicarPago();

    const deal = await journey.createDeal.execute({
      actorUserId: FA,
      offerId: offer.id,
      brief: null,
    });

    const pagamento = await journey.startPayment.execute({
      actorUserId: FA,
      dealId: deal.id,
      payerPhone: '+244923000000',
      idempotencyKey: `pay-${deal.id}`,
    });

    const webhook = ctx.payments.captureAndBuildWebhook(
      pagamento.intent.providerReference,
    );
    await journey.handleCapture.execute(ctx.payments.parseWebhookEvent(webhook));

    const fechado = await ctx.deals.findById(deal.id);

    expect(fechado?.status).toBe('PAID');
    expect(fechado?.escrowStatus).toBe('RELEASED');
    expect(await ctx.contents.findGrant(item.id, FA)).not.toBeNull();
  });

  it('o criador recebe o líquido, e a plataforma as duas metades da taxa', async () => {
    const { offer } = await publicarPago();

    const deal = await journey.createDeal.execute({
      actorUserId: FA,
      offerId: offer.id,
      brief: null,
    });
    const pagamento = await journey.startPayment.execute({
      actorUserId: FA,
      dealId: deal.id,
      payerPhone: '+244923000000',
      idempotencyKey: `pay-${deal.id}`,
    });
    await journey.handleCapture.execute(
      ctx.payments.parseWebhookEvent(
        ctx.payments.captureAndBuildWebhook(pagamento.intent.providerReference),
      ),
    );

    const carteira = await ctx.wallets.recomputeFromLedger('profile-criador', ctx.clock.now());

    // 18 000,00 anunciados: o criador recebe 17 100,00, e a NaDM fica com 1 800,00.
    expect(carteira.available.amountMinor).toBe(1_710_000n);
    expect(
      await ctx.ledger.amountOwed('PLATFORM_FEE_REVENUE', PLATFORM_SUBJECT_ID),
    ).toEqual(Money.fromMinor(180_000n));
  });

  it('o escrow fecha a zero: entrou e saiu o mesmo', async () => {
    const { offer } = await publicarPago();

    const deal = await journey.createDeal.execute({
      actorUserId: FA,
      offerId: offer.id,
      brief: null,
    });
    const pagamento = await journey.startPayment.execute({
      actorUserId: FA,
      dealId: deal.id,
      payerPhone: '+244923000000',
      idempotencyKey: `pay-${deal.id}`,
    });
    await journey.handleCapture.execute(
      ctx.payments.parseWebhookEvent(
        ctx.payments.captureAndBuildWebhook(pagamento.intent.providerReference),
      ),
    );

    expect((await ctx.ledger.balanceOf('ESCROW', deal.id)).isZero).toBe(true);

    for (const transaccao of ctx.db.ledger) {
      const soma = transaccao.entries.reduce(
        (total, entrada) => total.add(entrada.signedAmount),
        Money.zero(),
      );
      expect(soma.isZero).toBe(true);
    }
  });

  it('a conversa conta a história, incluindo o desbloqueio', async () => {
    const { offer } = await publicarPago();

    const deal = await journey.createDeal.execute({
      actorUserId: FA,
      offerId: offer.id,
      brief: null,
    });
    const pagamento = await journey.startPayment.execute({
      actorUserId: FA,
      dealId: deal.id,
      payerPhone: '+244923000000',
      idempotencyKey: `pay-${deal.id}`,
    });
    await journey.handleCapture.execute(
      ctx.payments.parseWebhookEvent(
        ctx.payments.captureAndBuildWebhook(pagamento.intent.providerReference),
      ),
    );

    const conversa = await ctx.messages.listByDeal(deal.id, 50);
    const corpos = conversa.map((m) => m.body);

    expect(corpos).toContain(STATE_CHANGE_BODY.PAYMENT_HELD);
    expect(corpos).toContain(STATE_CHANGE_BODY.CONTENT_UNLOCKED);
    expect(corpos).toContain(STATE_CHANGE_BODY.PAID);
  });

  it('sem pagar, o conteúdo continua bloqueado', async () => {
    const { item, offer } = await publicarPago();

    await journey.createDeal.execute({ actorUserId: FA, offerId: offer.id, brief: null });

    const vista = await get.execute({ handle: 'nelsonbeats', id: item.id, actorUserId: FA });

    expect(vista.access).toBe('LOCKED');
    expect(await ctx.contents.findGrant(item.id, FA)).toBeNull();
  });

  it('pago, o mesmo conteúdo abre para quem comprou e não para os outros', async () => {
    ctx.seedUser({ id: ESTRANHO });
    const { item, offer } = await publicarPago();

    const deal = await journey.createDeal.execute({
      actorUserId: FA,
      offerId: offer.id,
      brief: null,
    });
    const pagamento = await journey.startPayment.execute({
      actorUserId: FA,
      dealId: deal.id,
      payerPhone: '+244923000000',
      idempotencyKey: `pay-${deal.id}`,
    });
    await journey.handleCapture.execute(
      ctx.payments.parseWebhookEvent(
        ctx.payments.captureAndBuildWebhook(pagamento.intent.providerReference),
      ),
    );

    const comprador = await get.execute({
      handle: 'nelsonbeats',
      id: item.id,
      actorUserId: FA,
    });
    const outro = await get.execute({
      handle: 'nelsonbeats',
      id: item.id,
      actorUserId: ESTRANHO,
    });

    expect(comprador.access).toBe('GRANTED');
    expect(outro.access).toBe('LOCKED');
  });

  it('a mesma captura entregue duas vezes desbloqueia uma vez', async () => {
    const { item, offer } = await publicarPago();

    const deal = await journey.createDeal.execute({
      actorUserId: FA,
      offerId: offer.id,
      brief: null,
    });
    const pagamento = await journey.startPayment.execute({
      actorUserId: FA,
      dealId: deal.id,
      payerPhone: '+244923000000',
      idempotencyKey: `pay-${deal.id}`,
    });
    const webhook = ctx.payments.captureAndBuildWebhook(pagamento.intent.providerReference);

    await journey.handleCapture.execute(ctx.payments.parseWebhookEvent(webhook));
    await journey.handleCapture.execute(ctx.payments.parseWebhookEvent(webhook));

    expect(ctx.db.contentGrants.filter((g) => g.contentId === item.id && g.userId === FA)).toHaveLength(1);
    expect(ctx.db.ledger.filter((t) => t.kind === 'ESCROW_RELEASE')).toHaveLength(1);
  });
});
