export const CHANNEL_KINDS = ['PUSH', 'SMS', 'EMAIL'] as const;

export type ChannelKind = (typeof CHANNEL_KINDS)[number];

/** Quem recebe. O telefone e o e-mail vêm do utilizador, nunca do evento. */
export interface Recipient {
  userId: string;
  phone: string;
  email: string | null;
  displayName: string;
}

/**
 * O papel de quem recebe **neste** pedido.
 *
 * A mesma pessoa é comprador num negócio e criadora noutro, e a matriz do SDD
 * §14.2 distingue os dois — quem entregou não precisa de ser avisado de que
 * entregou.
 */
export type Party = 'buyer' | 'creator';

export interface NotificationPlan {
  recipientUserId: string;
  channels: ChannelKind[];
  template: string;
  /** Derivada de `(evento, destinatário)`, como manda o SDD §14.3. */
  idempotencyKey: string;
  data: Record<string, string>;
}

/**
 * O SMS custa dinheiro e interrompe (SDD §14.3).
 *
 * Só para estes três: o pagamento que está à espera de alguém, a aceitação que
 * põe o trabalho a andar, e o dinheiro que chegou à conta. Tudo o resto vive
 * bem com push.
 */
export const SMS_PERMITIDO = new Set([
  'deal.created',
  'deal.accepted',
  'payout.paid',
]);

/**
 * O que atravessa o silêncio nocturno (SDD §14.3).
 *
 * Dinheiro e disputa acordam uma pessoa; o resto espera pelas 7h. A escolha é
 * do SDD e não minha, e a razão é boa: uma notificação de pagamento às 23h é
 * útil, uma de mensagem nova não é.
 */
export const ATRAVESSA_A_NOITE = new Set([
  'payment.captured',
  'deal.created',
  'dispute.opened',
  'dispute.resolved',
  'escrow.released',
  'escrow.refunded',
  'payout.paid',
]);

/** Luanda é UTC+1 o ano inteiro. Sem horário de Verão, sem excepções. */
export const LUANDA_OFFSET_HOURS = 1;

const NOITE_COMECA = 22;
const NOITE_ACABA = 7;

/** A hora de Luanda de um instante, em inteiro de 0 a 23. */
export function luandaHour(instant: Date): number {
  return (instant.getUTCHours() + LUANDA_OFFSET_HOURS) % 24;
}

export function isQuietHour(instant: Date): boolean {
  const hora = luandaHour(instant);

  return hora >= NOITE_COMECA || hora < NOITE_ACABA;
}

/**
 * Quando é que isto pode sair.
 *
 * Silêncio é **adiar, não descartar**: uma notificação que chega às 23h sai às
 * 7h da manhã seguinte. Descartá-la seria perder informação que a pessoa quer,
 * só porque chegou à hora errada.
 */
export function deliverableAt(instant: Date, type: string): Date {
  if (!isQuietHour(instant) || ATRAVESSA_A_NOITE.has(type)) {
    return instant;
  }

  const saida = new Date(instant);
  const hora = luandaHour(instant);

  // Depois das 22h, o alvo é de manhã; antes das 7h, é hoje mesmo.
  if (hora >= NOITE_COMECA) {
    saida.setUTCDate(saida.getUTCDate() + 1);
  }

  saida.setUTCHours(NOITE_ACABA - LUANDA_OFFSET_HOURS, 0, 0, 0);

  return saida;
}

/**
 * A chave que impede a mesma notificação de sair duas vezes.
 *
 * Deriva de `(evento, destinatário, canal)` e não do momento: uma retentativa
 * do trabalhador, ou duas instâncias a correr ao mesmo tempo, produzem a mesma
 * chave e só um envio (SDD §14.3).
 */
export function notificationKey(
  eventId: string,
  recipientUserId: string,
  channel: ChannelKind,
): string {
  return `${eventId}:${recipientUserId}:${channel}`;
}
