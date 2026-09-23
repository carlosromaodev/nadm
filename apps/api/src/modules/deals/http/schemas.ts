import { z } from 'zod';
import { DEAL_STATUSES } from '../domain/deal-status';

/** Cêntimos como string de inteiro. Número JSON é IEEE-754 e não serve (RN-111). */
export const minorAmountSchema = z
  .string()
  .regex(/^\d+$/, 'Amount must be an integer number of minor units, as a string');

export const createDealSchema = z.object({
  offerId: z.string().uuid(),
  brief: z.string().trim().min(1).max(2000).nullable().optional().default(null),
  accountId: z.string().uuid().optional(),
  /** Obrigatória nas ofertas `BOOKING`: é a vaga que se está a tomar. */
  availabilityWindowId: z.string().uuid().optional(),
});

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  clientId: z.string().min(1).max(64).nullable().optional().default(null),
});

export const submitDeliverySchema = z.object({
  note: z.string().trim().min(1).max(4000),
});

export const openDisputeSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});

export const resolveDisputeSchema = z.object({
  /** A favor de quem. A administração decide uma das duas, nunca nenhuma. */
  resolution: z.enum(['BUYER', 'CREATOR']),
  note: z.string().trim().min(1).max(2000).nullable().optional().default(null),
});

export const adminMessageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

export const declineDealSchema = z.object({
  reason: z.string().trim().min(1).max(2000).nullable().optional().default(null),
});

/** Rejeitar sem motivo deixaria o criador sem saber o que corrigir. */
export const rejectDeliverySchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});

export const counterOfferSchema = z.object({
  /** O preço anunciado pedido, em cêntimos, como string de inteiro (RN-111). */
  priceMinor: minorAmountSchema,
  slaHours: z.coerce.number().int().min(1).max(24 * 90),
  message: z.string().trim().min(1).max(2000).nullable().optional().default(null),
});

export const startPaymentSchema = z.object({
  payerPhone: z
    .string()
    .trim()
    .regex(/^\+244\d{9}$/, 'Phone must be an Angolan number in E.164 format'),
});

export const listDealsQuerySchema = z.object({
  role: z.enum(['buyer', 'creator']).default('buyer'),
  status: z.enum(DEAL_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const createProfileSchema = z.object({
  handle: z.string().trim().min(3).max(30),
  displayName: z.string().trim().min(2).max(80),
  bio: z.string().trim().max(500).nullable().optional().default(null),
});

export const createOfferSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(2000).nullable().optional().default(null),
  priceMinor: minorAmountSchema,
  slaHours: z.coerce.number().int().min(1).max(24 * 90),
  revisionsIncluded: z.coerce.number().int().min(0).max(10).optional(),
  requiresBrief: z.boolean().optional(),
});

export type CreateDealBody = z.infer<typeof createDealSchema>;
export type SendMessageBody = z.infer<typeof sendMessageSchema>;
export type SubmitDeliveryBody = z.infer<typeof submitDeliverySchema>;
export type DeclineDealBody = z.infer<typeof declineDealSchema>;
export type OpenDisputeBody = z.infer<typeof openDisputeSchema>;
export type ResolveDisputeBody = z.infer<typeof resolveDisputeSchema>;
export type AdminMessageBody = z.infer<typeof adminMessageSchema>;
export type RejectDeliveryBody = z.infer<typeof rejectDeliverySchema>;
export type CounterOfferBody = z.infer<typeof counterOfferSchema>;
export type StartPaymentBody = z.infer<typeof startPaymentSchema>;
export type ListDealsQuery = z.infer<typeof listDealsQuerySchema>;
export type CreateProfileBody = z.infer<typeof createProfileSchema>;
export type CreateOfferBody = z.infer<typeof createOfferSchema>;
