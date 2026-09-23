export const MIMO_AMOUNTS = ['100000', '250000', '500000', '1000000', '2500000', '5000000'] as const;
/** Mockup estimate only. A future payment must use a server-authorised quote. */
export function estimateMimo(amount: string) {
  if (!MIMO_AMOUNTS.some(value => value === amount)) throw new Error('Escolhe um dos valores disponíveis.');
  const price = BigInt(amount);
  const fee = price * 5n / 100n;
  const money = (value: bigint) => ({ amount: value.toString(), currency: 'AOA' });
  return { price: money(price), buyerFee: money(fee), total: money(price + fee), creatorNet: money(price - fee) };
}
