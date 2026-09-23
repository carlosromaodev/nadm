import { describe, expect, it } from 'vitest';
import { createOfferSchema, updateOfferSchema, updateProfileSchema } from './schemas';

describe('profile HTTP schemas', () => {
  it('não aceita owner, handle nem preço como número JSON', () => {
    expect(updateProfileSchema.safeParse({ userId: 'outsider' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ handle: 'other' }).success).toBe(false);
    expect(updateOfferSchema.safeParse({ priceMinor: 5000 }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ availabilityStatus: 'NO_SLOTS' }).success).toBe(false);
  });
  it('não aceita controlos de acesso arbitrários nem agenda mal formada', () => {
    expect(updateProfileSchema.safeParse({ settings: { pro: true } }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ settings: { agenda: { days: [1, 1], startTime: '25:00', endTime: '19:00', slotsPerDay: 1 } } }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ settings: { tabOrder: ['content', 'content', 'offers'] } }).success).toBe(false);
  });
  it('não activa conteúdo ou assinaturas sem a respectiva implementação', () => {
    expect(createOfferSchema.safeParse({ title: 'Membros', priceMinor: '10000', slaHours: 24, kind: 'MEMBERSHIP' }).success).toBe(false);
  });
});
