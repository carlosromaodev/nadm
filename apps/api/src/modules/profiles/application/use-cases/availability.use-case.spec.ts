import { beforeEach, describe, expect, it } from 'vitest';
import { BusinessRuleError, ResourceNotFoundError } from '@/core/errors/domain-error';
import { makeJourney } from '@/shared/testing/deal-journey';
import { makeTestContext, type TestContext } from '@/shared/testing/test-context';
import {
  derivedAvailability,
  InvalidSlotCountError,
  InvalidWindowRangeError,
  NoSlotsAvailableError,
  openWindow,
  OverlappingWindowError,
  WindowInUseError,
} from '../../domain/availability';
import {
  CreateAvailabilityWindowUseCase,
  DeleteAvailabilityWindowUseCase,
  ListMyWindowsUseCase,
  ListOfferWindowsUseCase,
} from './availability.use-case';

const HORA = 60 * 60 * 1000;

describe('disponibilidade e vagas (F7)', () => {
  let ctx: TestContext;
  let journey: ReturnType<typeof makeJourney>;
  let criar: CreateAvailabilityWindowUseCase;
  let apagar: DeleteAvailabilityWindowUseCase;
  let listarDaOferta: ListOfferWindowsUseCase;
  let listarMinhas: ListMyWindowsUseCase;

  beforeEach(() => {
    ctx = makeTestContext();
    journey = makeJourney(ctx);

    criar = new CreateAvailabilityWindowUseCase(
      ctx.transactions,
      ctx.availability,
      ctx.offers,
      ctx.profiles,
      ctx.auditLog,
      ctx.ids,
      ctx.clock,
    );
    apagar = new DeleteAvailabilityWindowUseCase(
      ctx.transactions,
      ctx.availability,
      ctx.profiles,
      ctx.auditLog,
    );
    listarDaOferta = new ListOfferWindowsUseCase(ctx.availability, ctx.clock);
    listarMinhas = new ListMyWindowsUseCase(ctx.availability, ctx.profiles, ctx.clock);

    ctx.seedUser({ id: 'buyer' });
    ctx.seedUser({ id: 'outro-buyer' });
    ctx.seedCreator({ id: 'creator', handle: 'nelsonbeats' });
    ctx.seedCreator({ id: 'outro-creator', handle: 'outra' });
    ctx.seedOffer({ id: 'booking', profileId: 'profile-creator', kind: 'BOOKING' });
    ctx.seedOffer({ id: 'offer-1', profileId: 'profile-creator', kind: 'CUSTOM_SERVICE' });
  });

  const daquiA = (horas: number) => new Date(ctx.clock.now().getTime() + horas * HORA);

  const abrirJanela = (inicio: number, fim: number, vagas = 1, offerId = 'booking') =>
    criar.execute({
      actorUserId: 'creator',
      offerId,
      startsAt: daquiA(inicio),
      endsAt: daquiA(fim),
      slotsTotal: vagas,
    });

  describe('abrir janelas', () => {
    it('abre uma janela com as vagas que pediu', async () => {
      const janela = await abrirJanela(24, 26, 3);

      expect(janela.slotsTotal).toBe(3);
      expect(janela.slotsTaken).toBe(0);
      expect(janela.timezone).toBe('Africa/Luanda');
    });

    it('recusa janelas sobrepostas na mesma oferta (RN-033)', async () => {
      await abrirJanela(24, 26);

      await expect(abrirJanela(25, 27)).rejects.toThrow(OverlappingWindowError);
    });

    it('duas janelas encostadas não se sobrepõem — o fim é aberto', async () => {
      await abrirJanela(24, 26);

      await expect(abrirJanela(26, 28)).resolves.toBeDefined();
    });

    it('recusa um intervalo ao contrário e uma janela sem vagas', () => {
      expect(() =>
        openWindow({
          id: 'w',
          profileId: 'p',
          offerId: 'o',
          startsAt: daquiA(26),
          endsAt: daquiA(24),
          slotsTotal: 1,
        }),
      ).toThrow(InvalidWindowRangeError);

      expect(() =>
        openWindow({
          id: 'w',
          profileId: 'p',
          offerId: 'o',
          startsAt: daquiA(24),
          endsAt: daquiA(26),
          slotsTotal: 0,
        }),
      ).toThrow(InvalidSlotCountError);
    });

    it('recusa uma janela que já acabou', async () => {
      await expect(abrirJanela(-4, -2)).rejects.toThrow(BusinessRuleError);
    });

    it('só ofertas de marcação têm janelas', async () => {
      await expect(abrirJanela(24, 26, 1, 'offer-1')).rejects.toThrow(BusinessRuleError);
    });

    it('a oferta de outro criador não existe para este (RN-063)', async () => {
      ctx.seedOffer({ id: 'alheia', profileId: 'profile-outro-creator', kind: 'BOOKING' });

      await expect(abrirJanela(24, 26, 1, 'alheia')).rejects.toThrow(ResourceNotFoundError);
    });
  });

  describe('listar', () => {
    it('mostra as que ainda não acabaram, por ordem', async () => {
      await abrirJanela(48, 50);
      await abrirJanela(24, 26);

      const janelas = await listarDaOferta.execute('booking');

      expect(janelas.map((j) => j.startsAt.getTime())).toEqual([
        daquiA(24).getTime(),
        daquiA(48).getTime(),
      ]);
    });

    it('uma janela que passou deixa de aparecer', async () => {
      await abrirJanela(1, 2);

      ctx.clock.advanceHours(3);

      expect(await listarDaOferta.execute('booking')).toHaveLength(0);
    });

    it('a agenda do criador é só a dele', async () => {
      await abrirJanela(24, 26);

      expect(await listarMinhas.execute('creator')).toHaveLength(1);
      expect(await listarMinhas.execute('outro-creator')).toHaveLength(0);
    });
  });

  describe('RN-034 · a vaga é tomada com o Deal', () => {
    it('contratar consome uma vaga', async () => {
      const janela = await abrirJanela(24, 26, 2);

      await journey.createDeal.execute({
        actorUserId: 'buyer',
        offerId: 'booking',
        brief: 'Sessão de sábado.',
        availabilityWindowId: janela.id,
      });

      expect((await ctx.availability.findById(janela.id))?.slotsTaken).toBe(1);
    });

    it('o pedido guarda a janela que reservou', async () => {
      const janela = await abrirJanela(24, 26, 1);

      const deal = await journey.createDeal.execute({
        actorUserId: 'buyer',
        offerId: 'booking',
        brief: 'Sessão de sábado.',
        availabilityWindowId: janela.id,
      });

      expect(deal.windowId).toBe(janela.id);
    });

    it('esgotadas as vagas, o pedido seguinte é recusado', async () => {
      const janela = await abrirJanela(24, 26, 1);

      await journey.createDeal.execute({
        actorUserId: 'buyer',
        offerId: 'booking',
        brief: 'Sessão de sábado.',
        availabilityWindowId: janela.id,
      });

      await expect(
        journey.createDeal.execute({
          actorUserId: 'outro-buyer',
          offerId: 'booking',
          brief: 'Também quero.',
          availabilityWindowId: janela.id,
        }),
      ).rejects.toThrow(NoSlotsAvailableError);

      expect(ctx.db.deals.size).toBe(1);
    });

    it('uma oferta de marcação sem vaga escolhida é recusada', async () => {
      await abrirJanela(24, 26, 1);

      await expect(
        journey.createDeal.execute({
          actorUserId: 'buyer',
          offerId: 'booking',
          brief: 'Sem escolher vaga.',
        }),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('uma janela de outra oferta não serve para este pedido', async () => {
      ctx.seedOffer({ id: 'booking-2', profileId: 'profile-creator', kind: 'BOOKING' });
      const janela = await abrirJanela(24, 26, 1, 'booking-2');

      await expect(
        journey.createDeal.execute({
          actorUserId: 'buyer',
          offerId: 'booking',
          brief: 'Janela trocada.',
          availabilityWindowId: janela.id,
        }),
      ).rejects.toThrow(ResourceNotFoundError);
    });

    it('uma oferta que não é de marcação não pede vaga nenhuma', async () => {
      const deal = await journey.createDeal.execute({
        actorUserId: 'buyer',
        offerId: 'offer-1',
        brief: 'Vídeo personalizado.',
      });

      expect(deal.windowId).toBeNull();
    });
  });

  describe('a vaga volta quando o pedido morre', () => {
    async function pedidoComVaga() {
      const janela = await abrirJanela(24, 26, 1);

      const deal = await journey.createDeal.execute({
        actorUserId: 'buyer',
        offerId: 'booking',
        brief: 'Sessão de sábado.',
        availabilityWindowId: janela.id,
      });

      return { janela, deal };
    }

    it('o criador recusa e a vaga volta (T3)', async () => {
      const { janela, deal } = await pedidoComVaga();

      await journey.declineDeal.execute({ actorUserId: 'creator', dealId: deal.id });

      expect((await ctx.availability.findById(janela.id))?.slotsTaken).toBe(0);
    });

    it('a proposta expira e a vaga volta (T13)', async () => {
      const { janela, deal } = await pedidoComVaga();

      ctx.clock.advanceHours(48);
      await journey.runDeadlines.execute();

      expect((await ctx.deals.findById(deal.id))?.status).toBe('EXPIRED');
      expect((await ctx.availability.findById(janela.id))?.slotsTaken).toBe(0);
    });

    it('devolvida a vaga, outro comprador consegue contratar', async () => {
      const { janela, deal } = await pedidoComVaga();

      await journey.declineDeal.execute({ actorUserId: 'creator', dealId: deal.id });

      await expect(
        journey.createDeal.execute({
          actorUserId: 'outro-buyer',
          offerId: 'booking',
          brief: 'Agora eu.',
          availabilityWindowId: janela.id,
        }),
      ).resolves.toBeDefined();
    });

    it('um pedido aceite não devolve a vaga: o tempo ficou reservado', async () => {
      const { janela, deal } = await pedidoComVaga();

      await journey.startPayment.execute({
        actorUserId: 'buyer',
        dealId: deal.id,
        payerPhone: '+244923000000',
        idempotencyKey: `pay-${deal.id}`,
      });
      const webhook = ctx.payments.captureAndBuildWebhook(
        (await ctx.paymentIntents.findActiveByDeal(deal.id))!.providerReference,
      );
      await journey.handleCapture.execute(ctx.payments.parseWebhookEvent(webhook));
      await journey.acceptDeal.execute({ actorUserId: 'creator', dealId: deal.id });

      expect((await ctx.availability.findById(janela.id))?.slotsTaken).toBe(1);
    });
  });

  describe('apagar uma janela', () => {
    it('apaga enquanto não tiver reservas', async () => {
      const janela = await abrirJanela(24, 26, 1);

      await apagar.execute({ actorUserId: 'creator', windowId: janela.id });

      expect(await ctx.availability.findById(janela.id)).toBeNull();
    });

    it('não apaga uma janela já reservada — é um compromisso com alguém', async () => {
      const janela = await abrirJanela(24, 26, 1);

      await journey.createDeal.execute({
        actorUserId: 'buyer',
        offerId: 'booking',
        brief: 'Sessão de sábado.',
        availabilityWindowId: janela.id,
      });

      await expect(
        apagar.execute({ actorUserId: 'creator', windowId: janela.id }),
      ).rejects.toThrow(WindowInUseError);
    });

    it('a janela de outro criador não existe para este', async () => {
      const janela = await abrirJanela(24, 26, 1);

      await expect(
        apagar.execute({ actorUserId: 'outro-creator', windowId: janela.id }),
      ).rejects.toThrow(ResourceNotFoundError);
    });
  });

  describe('NO_SLOTS é derivado, e PAUSED tem precedência', () => {
    const perfil = (status: 'AVAILABLE' | 'PAUSED' | 'NO_SLOTS') =>
      ({ availabilityStatus: status }) as never;

    it('sem ofertas de marcação, o estado é o que está guardado', () => {
      expect(derivedAvailability(perfil('AVAILABLE'), null)).toBe('AVAILABLE');
    });

    it('com vagas livres, está disponível', () => {
      expect(derivedAvailability(perfil('AVAILABLE'), true)).toBe('AVAILABLE');
    });

    it('sem vagas livres, deriva NO_SLOTS', () => {
      expect(derivedAvailability(perfil('AVAILABLE'), false)).toBe('NO_SLOTS');
    });

    it('pausado ganha, haja vagas ou não', () => {
      expect(derivedAvailability(perfil('PAUSED'), true)).toBe('PAUSED');
      expect(derivedAvailability(perfil('PAUSED'), false)).toBe('PAUSED');
    });

    it('esgotar as vagas de uma oferta não bloqueia as outras', async () => {
      const janela = await abrirJanela(24, 26, 1);

      await journey.createDeal.execute({
        actorUserId: 'buyer',
        offerId: 'booking',
        brief: 'Sessão de sábado.',
        availabilityWindowId: janela.id,
      });

      expect(await ctx.availability.hasBookableSlots('profile-creator', ctx.clock.now())).toBe(
        false,
      );

      // E mesmo assim a oferta sem vagas nenhumas continua a aceitar pedidos.
      await expect(
        journey.createDeal.execute({
          actorUserId: 'outro-buyer',
          offerId: 'offer-1',
          brief: 'Vídeo personalizado.',
        }),
      ).resolves.toBeDefined();
    });
  });
});
