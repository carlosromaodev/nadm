import type { PrismaClient } from '@prisma/client';

export const CREATOR_ID = '11111111-1111-4111-8111-111111111111';
export const BUYER_ID = '22222222-2222-4222-8222-222222222222';
export const OUTSIDER_ID = '33333333-3333-4333-8333-333333333333';

export interface Fixtures {
  offerId: string;
  creatorProfileId: string;
}

/** Um criador com uma oferta, um comprador e um terceiro sem relação nenhuma. */
export async function seedFixtures(prisma: PrismaClient): Promise<Fixtures> {
  const creator = await prisma.user.create({
    data: {
      id: CREATOR_ID,
      phone: '+244923111111',
      displayName: 'Nelson Beats',
      roles: ['CREATOR'],
      verificationLevel: 'PHONE',
      accounts: { create: { type: 'INDIVIDUAL' } },
      profile: {
        create: {
          handle: 'nelsonbeats',
          displayName: 'Nelson Beats',
          publishedAt: new Date(),
          offers: {
            create: {
              kind: 'CUSTOM_SERVICE',
              title: 'Vídeo de dedicatória personalizado',
              priceMinor: 5_000_000n,
              currency: 'AOA',
              slaHours: 48,
              revisionsIncluded: 1,
              requiresBrief: true,
            },
          },
        },
      },
    },
    include: { profile: { include: { offers: true } } },
  });

  for (const [id, phone, name] of [
    [BUYER_ID, '+244923222222', 'Ana Domingos'],
    [OUTSIDER_ID, '+244923333333', 'Alguém de fora'],
  ] as const) {
    await prisma.user.create({
      data: {
        id,
        phone,
        displayName: name,
        roles: ['FAN'],
        verificationLevel: 'PHONE',
        accounts: { create: { type: 'INDIVIDUAL' } },
      },
    });
  }

  return {
    offerId: creator.profile!.offers[0].id,
    creatorProfileId: creator.profile!.id,
  };
}
