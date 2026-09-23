import { describe, expect, it } from 'vitest';
import { Money } from '@/shared/domain/money';
import { Deal, splitFees, type OfferSnapshot, type OpenDealInput } from './deal';
import {
  BriefRequiredError,
  DealNotExpiredError,
  DealProposalExpiredError,
  InvalidDealTransitionError,
  InvalidEscrowTransitionError,
  PaymentRequiredError,
  RefundNotDueError,
  RevisionsExhaustedError,
  SelfDealError,
} from './errors';

const NOW = new Date('2026-09-17T09:00:00.000Z');

function snapshot(overrides: Partial<OfferSnapshot> = {}): OfferSnapshot {
  return {
    offerId: 'offer-1',
    kind: 'CUSTOM_SERVICE',
    title: 'Vídeo personalizado',
    priceMinor: '5000000', // 50 000,00 Kz
    currency: 'AOA',
    slaHours: 48,
    revisionsIncluded: 1,
    requiresBrief: true,
    capturedAt: NOW.toISOString(),
    ...overrides,
  };
}

function openDeal(overrides: Partial<OpenDealInput> = {}): Deal {
  return Deal.open({
    id: 'deal-1',
    reference: 'NDM-2026-0000001',
    buyerUserId: 'buyer-1',
    buyerAccountId: 'account-1',
    creatorProfileId: 'profile-1',
    creatorUserId: 'creator-1',
    offerSnapshot: snapshot(),
    platformFeeBasisPoints: 500,
    brief: 'Parabéns para a minha irmã Ana, faz 30 anos no sábado.',
    proposalWindowHours: 48,
    now: NOW,
    ...overrides,
  });
}

/**
 * Leva o negócio até ao estado pedido, pela ordem do design: criar, pagar, e só
 * depois o criador aceitar um pedido que já tem o dinheiro retido.
 */
function dealAt(estado: 'PAGO' | 'ACCEPTED' | 'DELIVERED' | 'APPROVED' | 'PAID'): Deal {
  const deal = openDeal();

  deal.markPaymentCaptured(NOW);
  if (estado === 'PAGO') return deal;

  deal.accept(NOW);
  if (estado === 'ACCEPTED') return deal;

  deal.markDelivered(NOW);
  if (estado === 'DELIVERED') return deal;

  deal.approve(NOW);
  if (estado === 'APPROVED') return deal;

  deal.settle(NOW);
  return deal;
}

describe('splitFees', () => {
  it('cobra a mesma percentagem aos dois lados', () => {
    const { price, amount, creatorNet, platformFee, buyerFee, creatorFee } = splitFees(
      Money.fromMinor(1_800_000n),
      500,
    );

    expect(price.amountMinor).toBe(1_800_000n); // 18 000,00 Kz anunciados
    expect(buyerFee.amountMinor).toBe(90_000n); // o comprador paga +900,00
    expect(creatorFee.amountMinor).toBe(90_000n); // o criador recebe −900,00
    expect(amount.amountMinor).toBe(1_890_000n); // 18 900,00 Kz cobrados
    expect(creatorNet.amountMinor).toBe(1_710_000n); // 17 100,00 Kz recebidos
    expect(platformFee.amountMinor).toBe(180_000n); // 1 800,00 Kz para a NaDM
  });

  it('mantém RN-042 para qualquer preço: platformFee + creatorNet = amount', () => {
    for (let centimos = 0n; centimos < 500n; centimos += 1n) {
      const { amount, creatorNet, platformFee } = splitFees(Money.fromMinor(centimos), 500);

      expect(creatorNet.add(platformFee).amountMinor).toBe(amount.amountMinor);
    }
  });

  it('o comprador paga sempre o preço mais a sua metade da taxa', () => {
    const { price, amount, buyerFee } = splitFees(Money.fromMinor(333n), 500);

    expect(price.add(buyerFee).amountMinor).toBe(amount.amountMinor);
  });

  it('com taxa a zero, o comprador paga o preço e o criador recebe-o inteiro', () => {
    const { amount, creatorNet, platformFee } = splitFees(Money.fromMinor(1000n), 0);

    expect(amount.amountMinor).toBe(1000n);
    expect(creatorNet.amountMinor).toBe(1000n);
    expect(platformFee.isZero).toBe(true);
  });
});

describe('Deal', () => {
  describe('abertura (T1)', () => {
    it('nasce em PROPOSED com o dinheiro ainda por pagar', () => {
      const deal = openDeal();

      expect(deal.status).toBe('PROPOSED');
      expect(deal.escrowStatus).toBe('PENDING');
    });

    it('cobra ao comprador o preço mais 5% e reserva ao criador o preço menos 5%', () => {
      const deal = openDeal();

      expect(deal.price.amountMinor).toBe(5_000_000n);
      expect(deal.amount.amountMinor).toBe(5_250_000n);
      expect(deal.creatorNet.amountMinor).toBe(4_750_000n);
      expect(deal.platformFee.amountMinor).toBe(500_000n);
      expect(deal.buyerFee.amountMinor).toBe(250_000n);
      expect(deal.creatorFee.amountMinor).toBe(250_000n);
    });

    it('a repartição fecha ao cêntimo (RN-042)', () => {
      const deal = openDeal();

      expect(deal.creatorNet.add(deal.platformFee).equals(deal.amount)).toBe(true);
    });

    it('fecha ao cêntimo mesmo quando a taxa não divide', () => {
      const deal = openDeal({ offerSnapshot: snapshot({ priceMinor: '333' }) });

      expect(deal.creatorNet.amountMinor).toBe(317n);
      expect(deal.creatorFee.amountMinor).toBe(16n);
      expect(deal.amount.amountMinor).toBe(349n);
      expect(deal.creatorNet.add(deal.platformFee).amountMinor).toBe(349n);
    });

    it('usa o preço do snapshot e não o da oferta viva (RN-041)', () => {
      const deal = openDeal({ offerSnapshot: snapshot({ priceMinor: '1200000' }) });

      expect(deal.price.amountMinor).toBe(1_200_000n);
      expect(deal.offerSnapshot.priceMinor).toBe('1200000');
    });

    it('define o prazo de resposta do criador a partir da janela de proposta', () => {
      const deal = openDeal({ proposalWindowHours: 48 });

      expect(deal.toProps().expiresAt).toEqual(new Date('2026-09-19T09:00:00.000Z'));
    });

    it('não define prazo de entrega antes de haver aceitação', () => {
      expect(openDeal().toProps().dueAt).toBeNull();
    });

    it('recusa que um criador compre a si próprio (RN-040)', () => {
      expect(() =>
        openDeal({ buyerUserId: 'mesma-pessoa', creatorUserId: 'mesma-pessoa' }),
      ).toThrowError(SelfDealError);
    });

    it('recusa um brief vazio quando a oferta o exige', () => {
      expect(() => openDeal({ brief: '   ' })).toThrowError(BriefRequiredError);
      expect(() => openDeal({ brief: null })).toThrowError(BriefRequiredError);
    });

    it('aceita brief vazio quando a oferta não o exige', () => {
      const deal = openDeal({ offerSnapshot: snapshot({ requiresBrief: false }), brief: null });

      expect(deal.toProps().brief).toBeNull();
    });

    it('a conversa abre com o pedido lá dentro — há actividade desde o início', () => {
      expect(openDeal().toProps().lastMessageAt).toEqual(NOW);
    });
  });

  describe('caminho feliz completo', () => {
    it('percorre PROPOSED → ACCEPTED → DELIVERED → APPROVED → PAID', () => {
      const deal = openDeal();
      const percurso: string[] = [deal.status];

      deal.markPaymentCaptured(NOW);
      percurso.push(deal.status); // pagar não muda o estado comercial

      deal.accept(NOW);
      percurso.push(deal.status);
      deal.markDelivered(NOW);
      percurso.push(deal.status);
      deal.approve(NOW);
      percurso.push(deal.status);
      deal.settle(NOW);
      percurso.push(deal.status);

      expect(percurso).toEqual([
        'PROPOSED',
        'PROPOSED',
        'ACCEPTED',
        'DELIVERED',
        'APPROVED',
        'PAID',
      ]);
    });

    it('o dinheiro segue o seu próprio caminho: PENDING → HELD → RELEASED', () => {
      const deal = openDeal();

      expect(deal.escrowStatus).toBe('PENDING');

      deal.markPaymentCaptured(NOW);
      expect(deal.escrowStatus).toBe('HELD');

      deal.accept(NOW);
      deal.markDelivered(NOW);
      deal.approve(NOW);
      expect(deal.escrowStatus).toBe('HELD');

      deal.settle(NOW);
      expect(deal.escrowStatus).toBe('RELEASED');
    });

    it('é a aceitação que arranca o prazo de entrega, não o pagamento', () => {
      const deal = dealAt('PAGO');

      expect(deal.toProps().dueAt).toBeNull();

      deal.accept(NOW);

      expect(deal.toProps().dueAt).toEqual(new Date('2026-09-19T09:00:00.000Z'));
    });

    it('regista o momento de cada passo', () => {
      const props = dealAt('PAID').toProps();

      expect(props.acceptedAt).toEqual(NOW);
      expect(props.deliveredAt).toEqual(NOW);
      expect(props.approvedAt).toEqual(NOW);
      expect(props.settledAt).toEqual(NOW);
    });
  });

  describe('o pagamento vem antes da aceitação (DP-15)', () => {
    it('recusa aceitar um pedido que ainda não foi pago', () => {
      const deal = openDeal();

      expect(() => deal.accept(NOW)).toThrowError(PaymentRequiredError);
      expect(deal.status).toBe('PROPOSED');
    });

    it('aceita depois de o dinheiro estar retido', () => {
      const deal = dealAt('PAGO');

      deal.accept(NOW);

      expect(deal.status).toBe('ACCEPTED');
    });

    it('um pedido pago e ainda por aceitar tem dinheiro retido sem trabalho a correr', () => {
      const deal = dealAt('PAGO');

      expect(deal.status).toBe('PROPOSED');
      expect(deal.escrowStatus).toBe('HELD');
      expect(deal.toProps().dueAt).toBeNull();
    });
  });

  describe('transições recusadas', () => {
    it('não aceita um pedido já aceite', () => {
      const deal = dealAt('ACCEPTED');

      expect(() => deal.accept(NOW)).toThrowError(InvalidDealTransitionError);
    });

    it('não aceita uma proposta cujo prazo de resposta passou', () => {
      const deal = dealAt('PAGO');
      const tarde = new Date('2026-09-19T09:00:01.000Z');

      expect(() => deal.accept(tarde)).toThrowError(DealProposalExpiredError);
      expect(deal.status).toBe('PROPOSED');
    });

    it('não entrega antes de o criador aceitar', () => {
      const deal = dealAt('PAGO');

      expect(() => deal.markDelivered(NOW)).toThrowError(InvalidDealTransitionError);
    });

    it('não aprova um pedido que ainda não foi entregue', () => {
      const deal = dealAt('ACCEPTED');

      expect(() => deal.approve(NOW)).toThrowError(InvalidDealTransitionError);
    });

    it('não liberta dinheiro de um pedido que não foi aprovado', () => {
      const deal = dealAt('DELIVERED');

      expect(() => deal.settle(NOW)).toThrowError(InvalidDealTransitionError);
      expect(deal.escrowStatus).toBe('HELD');
    });

    it('não liberta o mesmo escrow duas vezes', () => {
      const deal = dealAt('PAID');

      expect(() => deal.settle(NOW)).toThrowError(InvalidDealTransitionError);
    });

    it('não captura o mesmo pagamento duas vezes', () => {
      const deal = dealAt('PAGO');

      expect(() => deal.markPaymentCaptured(NOW)).toThrowError(InvalidEscrowTransitionError);
    });

    it('a mensagem do erro diz de onde para onde se tentou ir', () => {
      const deal = dealAt('ACCEPTED');

      expect(() => deal.approve(NOW)).toThrowError('Deal cannot move from ACCEPTED to APPROVED');
    });
  });

  describe('as duas máquinas de estado são independentes', () => {
    it('um pedido entregue mantém o dinheiro retido — o caso que obriga a separá-las', () => {
      const deal = dealAt('DELIVERED');

      expect(deal.status).toBe('DELIVERED');
      expect(deal.escrowStatus).toBe('HELD');
    });

    it('um pedido pago e por aceitar é o outro caso: dinheiro parado, trabalho parado', () => {
      const deal = dealAt('PAGO');

      expect(deal.status).toBe('PROPOSED');
      expect(deal.escrowStatus).toBe('HELD');
    });

    it('o escrow recusa sair de PENDING sem passar por HELD', () => {
      const deal = Deal.reconstitute({
        ...openDeal().toProps(),
        status: 'APPROVED',
        escrowStatus: 'PENDING',
      });

      expect(() => deal.settle(NOW)).toThrowError(InvalidEscrowTransitionError);
    });
  });

  describe('participação (RN-060)', () => {
    it('reconhece comprador e criador como partes', () => {
      const deal = openDeal();

      expect(deal.isBuyer('buyer-1')).toBe(true);
      expect(deal.isCreator('creator-1')).toBe(true);
      expect(deal.isParticipant('buyer-1')).toBe(true);
      expect(deal.isParticipant('creator-1')).toBe(true);
    });

    it('não reconhece um terceiro', () => {
      expect(openDeal().isParticipant('outra-pessoa')).toBe(false);
    });
  });

  describe('fecho da conversa', () => {
    it('aceita mensagens enquanto o negócio decorre', () => {
      expect(dealAt('ACCEPTED').acceptsMessagesAt(NOW)).toBe(true);
    });

    it('aceita mensagens nos 30 dias seguintes ao fecho', () => {
      const deal = dealAt('PAID');
      const vinteENoveDias = new Date(NOW.getTime() + 29 * 24 * 60 * 60 * 1000);

      expect(deal.acceptsMessagesAt(vinteENoveDias)).toBe(true);
    });

    it('fecha a conversa passados 30 dias do fecho', () => {
      const deal = dealAt('PAID');
      const trintaEUmDias = new Date(NOW.getTime() + 31 * 24 * 60 * 60 * 1000);

      expect(deal.acceptsMessagesAt(trintaEUmDias)).toBe(false);
      expect(() => deal.assertAcceptsMessagesAt(trintaEUmDias)).toThrowError(
        /closed to new messages/,
      );
    });
  });
});

describe('Deal · as saídas que não são o caminho feliz (F4)', () => {
  const HORA = 60 * 60 * 1000;

  describe('T3 · recusa', () => {
    it('fecha o negócio e apaga o prazo de resposta', () => {
      const deal = dealAt('PAGO');

      deal.decline(NOW);

      expect(deal.status).toBe('DECLINED');
      expect(deal.closedAt).toEqual(NOW);
      expect(deal.expiresAt).toBeNull();
    });

    it('não recusa o que já foi aceite', () => {
      expect(() => dealAt('ACCEPTED').decline(NOW)).toThrowError(InvalidDealTransitionError);
    });

    it('recusar não move dinheiro nenhum por si só', () => {
      const deal = dealAt('PAGO');

      deal.decline(NOW);

      // O escrow continua retido: quem o fecha é o estorno, na mesma transacção.
      expect(deal.escrowStatus).toBe('HELD');
    });
  });

  describe('T13 · expiração', () => {
    it('expira depois de o prazo passar', () => {
      const deal = openDeal();
      const depois = new Date(deal.expiresAt!.getTime() + 1);

      deal.expire(depois);

      expect(deal.status).toBe('EXPIRED');
      expect(deal.closedAt).toEqual(depois);
    });

    it('recusa expirar antes do prazo, por muito que lho peçam', () => {
      const deal = openDeal();
      const antes = new Date(deal.expiresAt!.getTime() - 1);

      expect(() => deal.expire(antes)).toThrowError(DealNotExpiredError);
      expect(deal.status).toBe('PROPOSED');
    });

    it('`hasExpiredAt` só é verdade enquanto o pedido está por decidir', () => {
      const porDecidir = openDeal();
      const depois = new Date(porDecidir.expiresAt!.getTime() + 1);

      expect(porDecidir.hasExpiredAt(depois)).toBe(true);
      expect(dealAt('ACCEPTED').hasExpiredAt(depois)).toBe(false);
    });
  });

  describe('T11 · rejeição de entrega e revisões (RN-044)', () => {
    it('consome uma revisão e devolve o trabalho ao criador', () => {
      const deal = dealAt('DELIVERED');

      deal.rejectDelivery(NOW);

      expect(deal.status).toBe('IN_PROGRESS');
      expect(deal.revisionCount).toBe(1);
      expect(deal.revisionsRemaining).toBe(0);
      expect(deal.deliveredAt).toBeNull();
    });

    it('abre prazo novo de `slaHours` contado da rejeição', () => {
      const deal = dealAt('DELIVERED');
      const maisTarde = new Date(NOW.getTime() + 10 * HORA);

      deal.rejectDelivery(maisTarde);

      expect(deal.dueAt).toEqual(new Date(maisTarde.getTime() + 48 * HORA));
    });

    it('esgotadas as revisões, recusa e não altera nada', () => {
      const deal = dealAt('DELIVERED');

      deal.rejectDelivery(NOW);
      deal.markDelivered(NOW);

      expect(() => deal.rejectDelivery(NOW)).toThrowError(RevisionsExhaustedError);
      expect(deal.status).toBe('DELIVERED');
      expect(deal.revisionCount).toBe(1);
    });

    it('uma oferta sem revisões incluídas não aceita nenhuma rejeição', () => {
      const deal = Deal.open({
        id: 'deal-2',
        reference: 'NDM-2026-0000002',
        buyerUserId: 'buyer-1',
        buyerAccountId: 'account-1',
        creatorProfileId: 'profile-1',
        creatorUserId: 'creator-1',
        offerSnapshot: snapshot({ revisionsIncluded: 0 }),
        platformFeeBasisPoints: 500,
        brief: 'Um brief qualquer.',
        proposalWindowHours: 48,
        now: NOW,
      });

      deal.markPaymentCaptured(NOW);
      deal.accept(NOW);
      deal.markDelivered(NOW);

      expect(() => deal.rejectDelivery(NOW)).toThrowError(RevisionsExhaustedError);
    });
  });

  describe('T16 · devolução por atraso', () => {
    it('o direito nasce ao fim do prazo mais a tolerância', () => {
      const deal = dealAt('ACCEPTED');
      const limite = new Date(deal.dueAt!.getTime() + 48 * HORA);

      expect(deal.isRefundableForLateDeliveryAt(new Date(limite.getTime() - 1), 48)).toBe(false);
      expect(deal.isRefundableForLateDeliveryAt(limite, 48)).toBe(true);
    });

    it('uma entrega submetida tira o direito, mesmo fora de prazo', () => {
      const deal = dealAt('DELIVERED');
      const muitoDepois = new Date(NOW.getTime() + 500 * HORA);

      expect(deal.isRefundableForLateDeliveryAt(muitoDepois, 48)).toBe(false);
      expect(() => deal.assertRefundableForLateDeliveryAt(muitoDepois, 48)).toThrowError(
        RefundNotDueError,
      );
    });

    it('devolver fecha o negócio', () => {
      const deal = dealAt('ACCEPTED');

      deal.refund(NOW);

      expect(deal.status).toBe('REFUNDED');
      expect(deal.closedAt).toEqual(NOW);
    });
  });

  describe('escrow · E3 e E4', () => {
    it('E3 — do retido só se sai por libertação ou por devolução', () => {
      const deal = dealAt('PAGO');

      deal.markEscrowRefunded();

      expect(deal.escrowStatus).toBe('REFUNDED');
      expect(() => deal.markEscrowRefunded()).toThrowError(InvalidEscrowTransitionError);
    });

    it('E4 — um pedido nunca pago fecha o escrow sem passar por retido', () => {
      const deal = openDeal();

      deal.markPaymentFailed();

      expect(deal.escrowStatus).toBe('FAILED');
      expect(() => deal.markPaymentCaptured(NOW)).toThrowError(InvalidEscrowTransitionError);
    });

    it('dinheiro já libertado não se devolve', () => {
      expect(() => dealAt('PAID').markEscrowRefunded()).toThrowError(
        InvalidEscrowTransitionError,
      );
    });
  });

  describe('T10 · aprovação automática', () => {
    it('fica devida ao fim da janela, contada da entrega', () => {
      const deal = dealAt('DELIVERED');

      expect(deal.isAutoApprovalDueAt(new Date(NOW.getTime() + 71 * HORA), 72)).toBe(false);
      expect(deal.isAutoApprovalDueAt(new Date(NOW.getTime() + 72 * HORA), 72)).toBe(true);
    });

    it('um pedido já aprovado deixa de ser candidato', () => {
      const deal = dealAt('APPROVED');

      expect(deal.isAutoApprovalDueAt(new Date(NOW.getTime() + 500 * HORA), 72)).toBe(false);
    });
  });

  describe('fecho da conversa conta do fecho real', () => {
    it('um pedido recusado fecha a conversa 30 dias depois da recusa', () => {
      const deal = dealAt('PAGO');
      const recusadoEm = new Date(NOW.getTime() + 20 * HORA);

      deal.decline(recusadoEm);

      const vinteENove = new Date(recusadoEm.getTime() + 29 * 24 * HORA);
      const trintaEUm = new Date(recusadoEm.getTime() + 31 * 24 * HORA);

      expect(deal.acceptsMessagesAt(vinteENove)).toBe(true);
      expect(deal.acceptsMessagesAt(trintaEUm)).toBe(false);
    });
  });
});
