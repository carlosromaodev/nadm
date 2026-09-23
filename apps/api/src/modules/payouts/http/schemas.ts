import { z } from 'zod';
import { PAYOUT_STATUSES } from '../domain/payout';

/** Cêntimos como string de inteiro. Número JSON é IEEE-754 e não serve (RN-111). */
const minorAmountSchema = z
  .string()
  .regex(/^\d+$/, 'Amount must be an integer number of minor units, as a string');

export const requestPayoutSchema = z.object({
  amountMinor: minorAmountSchema,
  method: z.enum(['BANK_TRANSFER', 'MULTICAIXA_EXPRESS']),
  /** IBAN ou número de telefone. Nunca volta a sair da API por inteiro. */
  destination: z.string().trim().min(6).max(64),
});

export const payoutQueueQuerySchema = z.object({
  status: z.enum(PAYOUT_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const markProcessingSchema = z.object({
  providerReference: z.string().trim().min(1).max(120),
});

export const failPayoutSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});

export type RequestPayoutBody = z.infer<typeof requestPayoutSchema>;
export type PayoutQueueQuery = z.infer<typeof payoutQueueQuerySchema>;
export type MarkProcessingBody = z.infer<typeof markProcessingSchema>;
export type FailPayoutBody = z.infer<typeof failPayoutSchema>;
