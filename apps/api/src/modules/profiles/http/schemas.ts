import { z } from 'zod';
import { createOfferSchema as originalCreateOfferSchema } from '@/modules/deals/http/schemas';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const agendaSchema = z.object({
  days: z.array(z.number().int().min(0).max(6)).max(7).refine((days) => new Set(days).size === days.length),
  startTime: time,
  endTime: time,
  slotsPerDay: z.number().int().min(1).max(100),
  pauseUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
}).strict();

export const profileSettingsSchema = z.object({
  theme: z.enum(['dark', 'light']).optional(),
  category: z.string().trim().max(80).optional(),
  location: z.string().trim().max(100).optional(),
  whoCanMessage: z.enum(['everyone', 'members', 'customers']).optional(),
  showActivity: z.boolean().optional(),
  showReviews: z.boolean().optional(),
  showEarnings: z.boolean().optional(),
  notifications: z.boolean().optional(),
  publicVisible: z.boolean().optional(),
  discoverable: z.boolean().optional(),
  tabOrder: z.array(z.enum(['content', 'offers', 'reputation'])).length(3).refine((tabs) => new Set(tabs).size === 3).optional(),
  expressPhone: z.string().regex(/^\+244\d{9}$/).nullable().optional(),
  agenda: agendaSchema.optional(),
}).strict();

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(80).optional(),
  bio: z.string().trim().max(500).nullable().optional(),
  availabilityStatus: z.enum(['AVAILABLE', 'PAUSED']).optional(),
  settings: profileSettingsSchema.optional(),
}).strict().refine((body) => Object.keys(body).length > 0, 'Escolhe uma alteração.');

export const createOfferSchema = originalCreateOfferSchema.extend({
  kind: z.enum(['CUSTOM_SERVICE', 'DIRECT_MESSAGE', 'BOOKING']).optional(),
}).strict();

export const updateOfferSchema = originalCreateOfferSchema.partial().extend({
  status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
}).strict().refine((body) => Object.keys(body).length > 0, 'Escolhe uma alteração.');

export const discoverySchema = z.object({ q: z.string().trim().max(80).optional().default('') });
export type UpdateProfileBody = z.infer<typeof updateProfileSchema>;
export type UpdateOfferBody = z.infer<typeof updateOfferSchema>;
export type CreateOfferBody = z.infer<typeof createOfferSchema>;
export type DiscoveryQuery = z.infer<typeof discoverySchema>;
