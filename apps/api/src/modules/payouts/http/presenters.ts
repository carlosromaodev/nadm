import type { Money } from '@/shared/domain/money';
import type { Payout } from '../domain/payout';

function money(value: Money) {
  return { amount: value.amountMinor.toString(), currency: value.currency };
}

/**
 * **O destino completo nunca sai daqui.** Só a máscara, que é quanto basta para
 * o criador reconhecer a conta que escolheu.
 */
export function presentPayout(payout: Payout) {
  const props = payout.toProps();

  return {
    id: props.id,
    status: props.status,
    amount: money(props.amount),
    fee: money(props.fee),
    net: money(props.net),
    method: props.method,
    destination: props.destinationMasked,
    failureReason: props.failureReason,
    requestedAt: props.requestedAt.toISOString(),
    approvedAt: props.approvedAt?.toISOString() ?? null,
    settledAt: props.settledAt?.toISOString() ?? null,
  };
}
