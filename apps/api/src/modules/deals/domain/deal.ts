import { Money, type Currency } from '@/shared/domain/money';
import {
  DEAL_TRANSITIONS,
  ESCROW_TRANSITIONS,
  isTerminal,
  type DealStatus,
  type EscrowStatus,
} from './deal-status';
import {
  BriefRequiredError,
  ConversationClosedError,
  DealNotExpiredError,
  DealProposalExpiredError,
  InvalidDealTransitionError,
  InvalidEscrowTransitionError,
  PaymentRequiredError,
  RefundNotDueError,
  RevisionsExhaustedError,
  SelfDealError,
} from './errors';

export type OfferKind =
  | 'DIRECT_MESSAGE'
  | 'CONTENT_UNLOCK'
  | 'MEMBERSHIP'
  | 'CUSTOM_SERVICE'
  | 'BOOKING';

/**
 * Cópia congelada dos termos da oferta no momento em que o pedido nasce.
 *
 * É duplicação deliberada: o preço de um `Deal` é o do snapshot e nunca o da
 * oferta viva (RN-041). Sem isto, mudar o preço de uma oferta reescreveria a
 * história de todos os pedidos passados, incluindo os já facturados.
 */
export interface OfferSnapshot {
  readonly offerId: string;
  readonly kind: OfferKind;
  readonly title: string;
  readonly priceMinor: string;
  readonly currency: Currency;
  readonly slaHours: number;
  readonly revisionsIncluded: number;
  readonly requiresBrief: boolean;
  readonly capturedAt: string;
  /**
   * 1 no snapshot original, e mais um a cada contraproposta aceite.
   *
   * O preço de um `Deal` continua a vir do snapshot e nunca da oferta viva
   * (RN-041); o que a versão acrescenta é saber qual dos snapshots é que está
   * em vigor, sem ir ao histórico perguntar.
   */
  readonly version?: number;
}

export interface DealProps {
  id: string;
  reference: string;
  buyerUserId: string;
  buyerAccountId: string;
  creatorProfileId: string;
  creatorUserId: string;
  offerId: string;
  /** A janela reservada, nas ofertas `BOOKING`. `null` em todas as outras. */
  windowId: string | null;
  offerSnapshot: OfferSnapshot;
  status: DealStatus;
  escrowStatus: EscrowStatus;
  amount: Money;
  platformFee: Money;
  creatorNet: Money;
  brief: string | null;
  dueAt: Date | null;
  expiresAt: Date | null;
  acceptedAt: Date | null;
  deliveredAt: Date | null;
  approvedAt: Date | null;
  settledAt: Date | null;
  /** Quando o negócio fechou, por qualquer das saídas terminais. */
  closedAt: Date | null;
  /** Entregas rejeitadas pelo comprador até agora (RN-044). */
  revisionCount: number;
  lastMessageAt: Date | null;
  createdAt: Date;
}

export interface OpenDealInput {
  id: string;
  reference: string;
  buyerUserId: string;
  buyerAccountId: string;
  creatorProfileId: string;
  creatorUserId: string;
  offerSnapshot: OfferSnapshot;
  windowId?: string | null;
  /** Taxa de cada lado, em pontos base. 500 = 5%. Ver DP-07. */
  platformFeeBasisPoints: number;
  brief: string | null;
  proposalWindowHours: number;
  now: Date;
}

/**
 * A repartição de um pedido, como o design a apresenta.
 *
 * A NaDM cobra a mesma percentagem às duas partes: o comprador paga o preço
 * anunciado **mais** a taxa, e o criador recebe o preço anunciado **menos** a
 * taxa. Numa oferta de 18 000 a 5%, o comprador paga 18 900, o criador recebe
 * 17 100 e a plataforma fica com 1 800.
 *
 * RN-042 continua verdadeira sem alteração:
 *   platformFee + creatorNet = (buyerFee + creatorFee) + (preço − creatorFee)
 *                            = preço + buyerFee = amount
 */
export interface FeeSplit {
  /** O preço anunciado da oferta. */
  price: Money;
  /** O que o comprador paga, taxa incluída. */
  amount: Money;
  /** A parte que a plataforma fica, somadas as duas metades. */
  platformFee: Money;
  /** O que o criador recebe. */
  creatorNet: Money;
  /** A metade cobrada ao comprador, por cima do preço. */
  buyerFee: Money;
  /** A metade descontada ao criador. */
  creatorFee: Money;
}

export function splitFees(price: Money, basisPoints: number): FeeSplit {
  // A repartição não perde cêntimos: o resto fica com o criador (RN-110).
  const [creatorNet, creatorFee] = price.allocate([10_000 - basisPoints, basisPoints]);
  const buyerFee = creatorFee;

  return {
    price,
    amount: price.add(buyerFee),
    platformFee: buyerFee.add(creatorFee),
    creatorNet,
    buyerFee,
    creatorFee,
  };
}

/** Dias após um estado terminal em que a conversa deixa de aceitar mensagens. */
const CONVERSATION_GRACE_DAYS = 30;

/**
 * A raiz do sistema: pedido, pagamento, conversa e entrega são esta entidade,
 * e não quatro coisas ligadas por referências. Ver SDD §1.3.
 */
export class Deal {
  private constructor(private readonly props: DealProps) {}

  /** T1 — o comprador propõe. Congela os termos e reparte o valor. */
  static open(input: OpenDealInput): Deal {
    if (input.buyerUserId === input.creatorUserId) {
      throw new SelfDealError();
    }

    if (input.offerSnapshot.requiresBrief && !input.brief?.trim()) {
      throw new BriefRequiredError();
    }

    const price = Money.fromMinor(
      input.offerSnapshot.priceMinor,
      input.offerSnapshot.currency,
    );

    const { amount, platformFee, creatorNet } = splitFees(
      price,
      input.platformFeeBasisPoints,
    );

    return new Deal({
      id: input.id,
      reference: input.reference,
      buyerUserId: input.buyerUserId,
      buyerAccountId: input.buyerAccountId,
      creatorProfileId: input.creatorProfileId,
      creatorUserId: input.creatorUserId,
      offerId: input.offerSnapshot.offerId,
      windowId: input.windowId ?? null,
      offerSnapshot: input.offerSnapshot,
      status: 'PROPOSED',
      escrowStatus: 'PENDING',
      amount,
      platformFee,
      creatorNet,
      brief: input.brief?.trim() || null,
      dueAt: null,
      expiresAt: addHours(input.now, input.proposalWindowHours),
      acceptedAt: null,
      deliveredAt: null,
      approvedAt: null,
      settledAt: null,
      closedAt: null,
      revisionCount: 0,
      lastMessageAt: input.now,
      createdAt: input.now,
    });
  }

  static reconstitute(props: DealProps): Deal {
    return new Deal(props);
  }

  // ── Transições ────────────────────────────────────────────────────────────

  /**
   * T2 — o criador aceita um pedido **já pago**, dentro do prazo de resposta.
   *
   * Aceitar é o que arranca o prazo de entrega: o dinheiro já lá está desde o
   * pagamento, por isso não há nada entre aceitar e começar a trabalhar.
   */
  accept(now: Date): void {
    this.assertTransition('ACCEPTED');

    if (this.props.escrowStatus !== 'HELD') {
      throw new PaymentRequiredError();
    }

    if (this.props.expiresAt && now >= this.props.expiresAt) {
      throw new DealProposalExpiredError();
    }

    this.props.status = 'ACCEPTED';
    this.props.acceptedAt = now;
    this.props.dueAt = addHours(now, this.props.offerSnapshot.slaHours);
  }

  /**
   * E1 — o pagamento foi capturado e o dinheiro fica retido.
   *
   * **Não muda o estado comercial.** O pedido continua à espera da decisão do
   * criador; o que mudou foi só onde o dinheiro está. É a separação das duas
   * máquinas de estado a fazer o seu trabalho.
   *
   * Nunca é accionada por um utilizador, só por notificação do parceiro.
   */
  markPaymentCaptured(_now: Date): void {
    this.assertEscrowTransition('HELD');

    this.props.escrowStatus = 'HELD';
  }

  /** T8 — o criador submete a entrega. */
  markDelivered(now: Date): void {
    this.assertTransition('DELIVERED');

    this.props.status = 'DELIVERED';
    this.props.deliveredAt = now;
  }

  /** T9 — o comprador aprova. */
  approve(now: Date): void {
    this.assertTransition('APPROVED');

    this.props.status = 'APPROVED';
    this.props.approvedAt = now;
  }

  /**
   * T12 + E2 — o escrow liberta-se para a carteira do criador.
   *
   * Não existe rota que chame isto directamente: é consequência de `approve`,
   * na mesma transacção, e o lançamento no razão acompanha-a.
   */
  settle(now: Date): void {
    this.assertTransition('PAID');
    this.assertEscrowTransition('RELEASED');

    this.props.status = 'PAID';
    this.props.escrowStatus = 'RELEASED';
    this.props.settledAt = now;
    this.props.closedAt = now;
  }

  // ── F4 · as saídas que não são o caminho feliz ────────────────────────────

  /**
   * T3 — o criador recusa.
   *
   * O estorno não acontece aqui: é consequência, e o caso de uso lança-o na
   * mesma transacção. O que a entidade sabe é que o negócio fechou e que o
   * prazo de resposta deixou de fazer sentido.
   */
  decline(now: Date): void {
    this.assertTransition('DECLINED');

    this.props.status = 'DECLINED';
    this.props.closedAt = now;
    this.props.expiresAt = null;
  }

  /**
   * T13 — o prazo de resposta esgotou-se sem o criador decidir.
   *
   * Só o sistema a acciona, e só depois de `expiresAt`. Um pedido que ainda
   * está dentro do prazo não expira por muito que lhe peçam.
   */
  expire(now: Date): void {
    this.assertTransition('EXPIRED');

    if (!this.props.expiresAt || now < this.props.expiresAt) {
      throw new DealNotExpiredError();
    }

    this.props.status = 'EXPIRED';
    this.props.closedAt = now;
  }

  /** T16 — o negócio termina com o dinheiro a voltar ao comprador. */
  refund(now: Date): void {
    this.assertTransition('REFUNDED');

    this.props.status = 'REFUNDED';
    this.props.closedAt = now;
  }

  /**
   * T11 — o comprador rejeita a entrega e o trabalho volta ao criador.
   *
   * Consome uma revisão e abre prazo novo, contado a partir de agora e não do
   * prazo antigo: o criador não é penalizado pelo tempo que o comprador levou
   * a responder. Esgotadas as revisões, o caminho é a disputa (RN-044).
   */
  rejectDelivery(now: Date): void {
    this.assertTransition('IN_PROGRESS');

    if (this.revisionsRemaining <= 0) {
      throw new RevisionsExhaustedError(this.props.offerSnapshot.revisionsIncluded);
    }

    this.props.revisionCount += 1;
    this.props.status = 'IN_PROGRESS';
    this.props.deliveredAt = null;
    this.props.dueAt = addHours(now, this.props.offerSnapshot.slaHours);
  }

  /**
   * E3 — o escrow devolve-se ao comprador.
   *
   * Nunca por acção directa: acompanha sempre T3, T13 ou T16, na mesma
   * transacção que o lançamento do estorno no razão (RN-110).
   */
  markEscrowRefunded(): void {
    this.assertEscrowTransition('REFUNDED');

    this.props.escrowStatus = 'REFUNDED';
  }

  /**
   * E4 — o pedido morreu sem nunca ter sido pago.
   *
   * Não há dinheiro nenhum para mover, e por isso não há lançamento no razão:
   * o escrow fecha só para o estado do dinheiro não ficar eternamente à espera
   * de uma captura que já não vem.
   */
  markPaymentFailed(): void {
    this.assertEscrowTransition('FAILED');

    this.props.escrowStatus = 'FAILED';
  }

  /**
   * T4 — o criador responde com outro preço, outro prazo, ou ambos.
   *
   * **Não mexe em dinheiro.** O escrow continua a valer o que valia, e o acerto
   * só acontece se e quando o comprador aceitar. Um pedido em contraproposta é
   * um pedido ainda financiado pelo valor antigo.
   */
  counterOffer(now: Date, responseWindowHours: number): void {
    this.assertTransition('COUNTER_OFFERED');

    if (this.props.escrowStatus !== 'HELD') {
      throw new PaymentRequiredError();
    }

    this.props.status = 'COUNTER_OFFERED';
    // O prazo passa a ser do comprador: é ele que tem de responder agora.
    this.props.expiresAt = addHours(now, responseWindowHours);
  }

  /**
   * T5 — o comprador aceita os termos novos.
   *
   * Substitui o snapshot e reparte o valor novo. É a **única** escrita que
   * altera os valores de um `Deal` depois de criado, e existe porque a
   * renegociação é exactamente isso: o acordo mudou.
   *
   * O acerto do escrow é consequência e corre na mesma transacção — devolver a
   * diferença se o preço desceu, ou, se subiu, ter sido ela a captura que
   * trouxe este método a correr.
   */
  acceptCounterOffer(
    input: { price: Money; slaHours: number; platformFeeBasisPoints: number },
    now: Date,
    proposalWindowHours: number,
  ): void {
    this.assertTransition('PROPOSED');

    const { amount, platformFee, creatorNet } = splitFees(
      input.price,
      input.platformFeeBasisPoints,
    );

    this.props.offerSnapshot = {
      ...this.props.offerSnapshot,
      priceMinor: input.price.amountMinor.toString(),
      currency: input.price.currency,
      slaHours: input.slaHours,
      capturedAt: now.toISOString(),
      version: (this.props.offerSnapshot.version ?? 1) + 1,
    };

    this.props.amount = amount;
    this.props.platformFee = platformFee;
    this.props.creatorNet = creatorNet;

    this.props.status = 'PROPOSED';
    // O prazo volta a ser do criador, que tem de decidir sobre o acordo novo.
    this.props.expiresAt = addHours(now, proposalWindowHours);
  }

  /** T6 — o comprador recusa os termos novos e o negócio fecha, com estorno. */
  declineCounterOffer(now: Date): void {
    this.assertTransition('DECLINED');

    this.props.status = 'DECLINED';
    this.props.closedAt = now;
    this.props.expiresAt = null;
  }

  /**
   * Quanto falta cobrar ao comprador para o escrow valer o preço novo.
   *
   * Positivo, o comprador reforça; negativo, a plataforma devolve; zero, só o
   * prazo mudou. É sempre a diferença entre totais, nunca entre preços: quem
   * paga a taxa do comprador é o comprador, e ela sobe com o preço.
   */
  settlementFor(price: Money, platformFeeBasisPoints: number): Money {
    const { amount } = splitFees(price, platformFeeBasisPoints);

    return amount.subtract(this.props.amount);
  }

  // ── F4 · prazos, lidos contra o relógio injectado ─────────────────────────

  /**
   * O prazo passou e o pedido continua por decidir.
   *
   * Vale para os dois lados da negociação: em `PROPOSED` quem não respondeu foi
   * o criador, em `COUNTER_OFFERED` foi o comprador. A consequência é a mesma —
   * o pedido morre e o dinheiro volta (SDD §5.1, T13).
   */
  hasExpiredAt(now: Date): boolean {
    if (this.props.status !== 'PROPOSED' && this.props.status !== 'COUNTER_OFFERED') {
      return false;
    }

    return this.props.expiresAt !== null && now >= this.props.expiresAt;
  }

  /** T10 — passaram as horas de aprovação sem o comprador responder. */
  isAutoApprovalDueAt(now: Date, windowHours: number): boolean {
    return (
      this.props.status === 'DELIVERED' &&
      this.props.deliveredAt !== null &&
      now >= addHours(this.props.deliveredAt, windowHours)
    );
  }

  /**
   * T16 — o prazo de entrega foi ultrapassado em mais do que a tolerância e o
   * comprador ganhou direito a pedir o dinheiro de volta.
   *
   * O direito nasce do tempo, mas a devolução não é automática: quem a pede é
   * o comprador. Um criador atrasado que entregue antes do pedido continua a
   * receber.
   */
  isRefundableForLateDeliveryAt(now: Date, graceHours: number): boolean {
    if (this.props.status !== 'ACCEPTED' && this.props.status !== 'IN_PROGRESS') {
      return false;
    }

    return this.props.dueAt !== null && now >= addHours(this.props.dueAt, graceHours);
  }

  /**
   * O instante em que o comprador ganha o direito a pedir a devolução, ou
   * `null` quando não há prazo por cumprir.
   *
   * Existe para a interface não ter de reimplementar a regra do prazo: quem
   * sabe quando o direito nasce é o servidor, e limita-se a dizê-lo.
   */
  refundableFrom(graceHours: number): Date | null {
    if (this.props.status !== 'ACCEPTED' && this.props.status !== 'IN_PROGRESS') {
      return null;
    }

    return this.props.dueAt ? addHours(this.props.dueAt, graceHours) : null;
  }

  assertRefundableForLateDeliveryAt(now: Date, graceHours: number): void {
    if (!this.isRefundableForLateDeliveryAt(now, graceHours)) {
      throw new RefundNotDueError();
    }
  }

  touchConversation(now: Date): void {
    this.props.lastMessageAt = now;
  }

  // ── Participação e leitura ────────────────────────────────────────────────

  isBuyer(userId: string): boolean {
    return this.props.buyerUserId === userId;
  }

  isCreator(userId: string): boolean {
    return this.props.creatorUserId === userId;
  }

  isParticipant(userId: string): boolean {
    return this.isBuyer(userId) || this.isCreator(userId);
  }

  /** A conversa fecha 30 dias depois de o negócio terminar. */
  acceptsMessagesAt(now: Date): boolean {
    if (!isTerminal(this.props.status)) return true;

    const closedSince =
      this.props.closedAt ?? this.props.settledAt ?? this.props.approvedAt ?? this.props.createdAt;
    const graceEnd = addHours(closedSince, CONVERSATION_GRACE_DAYS * 24);

    return now < graceEnd;
  }

  assertAcceptsMessagesAt(now: Date): void {
    if (!this.acceptsMessagesAt(now)) {
      throw new ConversationClosedError();
    }
  }

  get id(): string {
    return this.props.id;
  }

  get reference(): string {
    return this.props.reference;
  }

  get status(): DealStatus {
    return this.props.status;
  }

  get escrowStatus(): EscrowStatus {
    return this.props.escrowStatus;
  }

  /** O dinheiro está retido: fechar o pedido obriga a estornar. */
  get isFunded(): boolean {
    return this.props.escrowStatus === 'HELD';
  }

  get revisionCount(): number {
    return this.props.revisionCount;
  }

  get revisionsRemaining(): number {
    return Math.max(0, this.props.offerSnapshot.revisionsIncluded - this.props.revisionCount);
  }

  get dueAt(): Date | null {
    return this.props.dueAt;
  }

  get deliveredAt(): Date | null {
    return this.props.deliveredAt;
  }

  get expiresAt(): Date | null {
    return this.props.expiresAt;
  }

  get closedAt(): Date | null {
    return this.props.closedAt;
  }

  get amount(): Money {
    return this.props.amount;
  }

  get platformFee(): Money {
    return this.props.platformFee;
  }

  get creatorNet(): Money {
    return this.props.creatorNet;
  }

  /** O preço anunciado da oferta, sem taxa nenhuma dos dois lados. */
  get price(): Money {
    return Money.fromMinor(
      this.props.offerSnapshot.priceMinor,
      this.props.offerSnapshot.currency,
    );
  }

  /** A metade da taxa descontada ao criador. */
  get creatorFee(): Money {
    return this.price.subtract(this.props.creatorNet);
  }

  /** A metade da taxa cobrada ao comprador, por cima do preço. */
  get buyerFee(): Money {
    return this.props.amount.subtract(this.price);
  }

  get buyerUserId(): string {
    return this.props.buyerUserId;
  }

  get creatorUserId(): string {
    return this.props.creatorUserId;
  }

  get creatorProfileId(): string {
    return this.props.creatorProfileId;
  }

  get offerSnapshot(): OfferSnapshot {
    return this.props.offerSnapshot;
  }

  /** A janela reservada, quando a oferta é de marcação. */
  get windowId(): string | null {
    return this.props.windowId;
  }

  toProps(): DealProps {
    return { ...this.props };
  }

  // ── Guardas de transição ──────────────────────────────────────────────────

  private assertTransition(to: DealStatus): void {
    if (!DEAL_TRANSITIONS[this.props.status].includes(to)) {
      throw new InvalidDealTransitionError(this.props.status, to);
    }
  }

  private assertEscrowTransition(to: EscrowStatus): void {
    if (!ESCROW_TRANSITIONS[this.props.escrowStatus].includes(to)) {
      throw new InvalidEscrowTransitionError(this.props.escrowStatus, to);
    }
  }
}

function addHours(from: Date, hours: number): Date {
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}
