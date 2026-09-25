import { PrismaClient } from '@prisma/client';
import { semearCriadores } from './seed-creators';

const prisma = new PrismaClient();

/**
 * Semente de desenvolvimento: um criador com uma oferta e dois compradores,
 * para percorrer o ciclo de F1 no browser sem escrever SQL.
 *
 * Os identificadores são fixos para poderem ir no cabeçalho `X-Dev-User`
 * enquanto DP-01 não fechar.
 */
const CREATOR_ID = '11111111-1111-4111-8111-111111111111';
const BUYER_ID = '22222222-2222-4222-8222-222222222222';
const OUTSIDER_ID = '33333333-3333-4333-8333-333333333333';

async function main(): Promise<void> {
  await prisma.user.upsert({
    where: { id: CREATOR_ID },
    update: {},
    create: {
      id: CREATOR_ID,
      phone: '+244923111111',
      displayName: 'Nelson Beats',
      roles: ['CREATOR', 'FAN'],
      verificationLevel: 'PHONE',
      accounts: {
        create: { type: 'INDIVIDUAL', legalName: null, taxId: null },
      },
      profile: {
        create: {
          handle: 'nelsonbeats',
          displayName: 'Nelson Beats',
          bio: 'Produtor musical em Luanda. Beats, dedicatórias e mistura.',
          publishedAt: new Date(),
          offers: {
            create: {
              kind: 'CUSTOM_SERVICE',
              title: 'Vídeo de dedicatória personalizado',
              description: 'Um vídeo gravado só para ti ou para quem quiseres surpreender.',
              priceMinor: 5_000_000n, // 50 000,00 Kz
              currency: 'AOA',
              slaHours: 48,
              revisionsIncluded: 1,
              requiresBrief: true,
            },
          },
        },
      },
    },
  });

  for (const [id, phone, name] of [
    [BUYER_ID, '+244923222222', 'Ana Domingos'],
    [OUTSIDER_ID, '+244923333333', 'Alguém de fora'],
  ] as const) {
    await prisma.user.upsert({
      where: { id },
      update: {},
      create: {
        id,
        phone,
        displayName: name,
        roles: ['FAN'],
        verificationLevel: 'PHONE',
        accounts: { create: { type: 'INDIVIDUAL' } },
      },
    });
  }

  const publicadas = await semearCriadores(prisma);

  const offer = await prisma.offer.findFirstOrThrow({
    where: { profile: { handle: 'nelsonbeats' }, kind: { not: 'CONTENT_UNLOCK' } },
  });

  console.log('Semente aplicada.');
  console.log(`  criador  X-Dev-User: ${CREATOR_ID}  (/nelsonbeats)`);
  console.log(`  comprador X-Dev-User: ${BUYER_ID}`);
  console.log(`  terceiro  X-Dev-User: ${OUTSIDER_ID}  (usar para provar o 404)`);
  console.log(`  oferta:   ${offer.id}`);

  const criadores = await prisma.profile.count({ where: { publishedAt: { not: null } } });
  console.log(`  ${criadores} criadores publicados, ${publicadas} publicações novas com imagem.`);
  console.log('  Entra como espectador e abre /descobrir para os ver.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
