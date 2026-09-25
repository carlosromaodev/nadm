import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Prisma, PrismaClient } from '@prisma/client';
import { gerarPng, type Paleta } from './seed-media';

/**
 * Os criadores de demonstração, para o espectador ter o que ver.
 *
 * Sem isto, `/inicio`, `/descobrir` e o perfil de um criador ficam todos no
 * estado vazio — que está bem desenhado mas não prova nada sobre o produto.
 */

/** O mesmo directório que `LocalPrivateMediaStorage` serve. */
const MEDIA = resolve(__dirname, '../var/media');

interface Publicacao {
  legenda: string;
  paga?: number;
  paleta: Paleta;
}

interface Criador {
  id: string;
  telefone: string;
  nome: string;
  handle: string;
  bio: string;
  categoria: string;
  cidade: string;
  avatarUrl: string;
  /** `PAUSED` para um deles, para o cartão de perfil mostrar os dois estados. */
  disponibilidade?: 'AVAILABLE' | 'PAUSED';
  ofertas: Array<{
    kind: 'CUSTOM_SERVICE' | 'DIRECT_MESSAGE' | 'BOOKING';
    title: string;
    description: string;
    precoMinor: bigint;
    slaHours: number;
    revisoes?: number;
    exigeBrief?: boolean;
  }>;
  publicacoes: Publicacao[];
}

const VERDE: Paleta = { de: [22, 40, 30], para: [225, 248, 59] };
const NOITE: Paleta = { de: [18, 22, 40], para: [120, 200, 255] };
const TERRA: Paleta = { de: [48, 28, 18], para: [255, 186, 96] };
const ROSA: Paleta = { de: [44, 18, 38], para: [255, 140, 190] };
const MAR: Paleta = { de: [12, 38, 44], para: [110, 235, 210] };

export const CRIADORES: Criador[] = [
  {
    id: '44444444-4444-4444-8444-444444444401',
    telefone: '+244923400001',
    nome: 'Kiza Fotografia',
    handle: 'kiza',
    bio: 'Retrato e casamento em Luanda. Luz natural, sem pressa.',
    categoria: 'Fotografia',
    cidade: 'Luanda',
    avatarUrl: '/demo-creators/kiza.png',
    ofertas: [
      {
        kind: 'BOOKING',
        title: 'Sessão de retrato',
        description: 'Uma hora de estúdio, com as fotos tratadas em três dias.',
        precoMinor: 3_500_000n,
        slaHours: 72,
        revisoes: 1,
      },
      {
        kind: 'CUSTOM_SERVICE',
        title: 'Tratamento de 10 fotos',
        description: 'Envia-me as tuas e devolvo-as tratadas.',
        precoMinor: 1_200_000n,
        slaHours: 48,
        revisoes: 2,
      },
    ],
    publicacoes: [
      { legenda: 'Fim de tarde na Ilha. Luz de Setembro.', paleta: TERRA },
      { legenda: 'Casamento na Samba — a parte de que ninguém se lembra de tirar foto.', paleta: ROSA },
      { legenda: 'Ensaio completo, 24 fotos.', paga: 2_500_000, paleta: NOITE },
    ],
  },
  {
    id: '44444444-4444-4444-8444-444444444402',
    telefone: '+244923400002',
    nome: 'Mana Tchi',
    handle: 'manatchi',
    bio: 'Cozinha angolana sem atalhos. Receitas, aulas e encomendas.',
    categoria: 'Cozinha',
    cidade: 'Benguela',
    avatarUrl: '/demo-creators/manatchi.png',
    ofertas: [
      {
        kind: 'DIRECT_MESSAGE',
        title: 'Pergunta sobre uma receita',
        description: 'Manda-me a dúvida e respondo em vídeo.',
        precoMinor: 350_000n,
        slaHours: 24,
        revisoes: 0,
        exigeBrief: true,
      },
      {
        kind: 'BOOKING',
        title: 'Aula de moamba, ao vivo',
        description: 'Duas horas, contigo a cozinhar comigo.',
        precoMinor: 4_500_000n,
        slaHours: 48,
      },
    ],
    publicacoes: [
      { legenda: 'Moamba de galinha como a minha avó fazia.', paleta: TERRA },
      { legenda: 'O truque do óleo de palma que ninguém conta.', paga: 800_000, paleta: VERDE },
    ],
  },
  {
    id: '44444444-4444-4444-8444-444444444403',
    telefone: '+244923400003',
    nome: 'DJ Paulo Kanda',
    handle: 'paulokanda',
    bio: 'Kuduro e afro-house. Sets, dedicatórias e produção.',
    categoria: 'Música',
    cidade: 'Luanda',
    avatarUrl: '/demo-creators/paulokanda.png',
    ofertas: [
      {
        kind: 'CUSTOM_SERVICE',
        title: 'Dedicatória em áudio',
        description: 'Uma mensagem tua, na minha voz e com batida por baixo.',
        precoMinor: 900_000n,
        slaHours: 24,
        revisoes: 1,
        exigeBrief: true,
      },
    ],
    publicacoes: [
      { legenda: 'Set de sábado no Miradouro da Lua.', paleta: NOITE },
      { legenda: 'Beat novo. Diz-me o que achas.', paleta: MAR },
    ],
  },
  {
    id: '44444444-4444-4444-8444-444444444404',
    telefone: '+244923400004',
    nome: 'Ilda Costura',
    handle: 'ildacostura',
    bio: 'Roupa por medida e arranjos. Trinta anos a coser.',
    categoria: 'Moda',
    cidade: 'Huambo',
    avatarUrl: '/demo-creators/ildacostura.png',
    disponibilidade: 'PAUSED',
    ofertas: [
      {
        kind: 'CUSTOM_SERVICE',
        title: 'Vestido por medida',
        description: 'Escolhes o tecido, eu trato do resto.',
        precoMinor: 7_500_000n,
        slaHours: 240,
        revisoes: 2,
        exigeBrief: true,
      },
    ],
    publicacoes: [{ legenda: 'Traje completo, feito esta semana.', paleta: ROSA }],
  },
  {
    id: '44444444-4444-4444-8444-444444444405',
    telefone: '+244923400005',
    nome: 'Estúdio Malanje',
    handle: 'estudiomalanje',
    bio: 'Vídeo para marcas e criadores. Guião, filmagem e montagem.',
    categoria: 'Vídeo',
    cidade: 'Malanje',
    avatarUrl: '/demo-creators/estudiomalanje.png',
    ofertas: [
      {
        kind: 'BOOKING',
        title: 'Dia de filmagem',
        description: 'Equipa, equipamento e montagem incluída.',
        precoMinor: 25_000_000n,
        slaHours: 336,
        revisoes: 2,
      },
      {
        kind: 'CUSTOM_SERVICE',
        title: 'Montagem de um vídeo',
        description: 'Envia o material e devolvo montado.',
        precoMinor: 6_000_000n,
        slaHours: 120,
        revisoes: 3,
      },
    ],
    publicacoes: [
      { legenda: 'Bastidores da campanha de Agosto.', paleta: MAR },
      { legenda: 'Como montamos um anúncio de 30 segundos.', paga: 1_500_000, paleta: NOITE },
    ],
  },
];

/** Escreve a imagem no disco e devolve a linha de `media` por criar. */
async function criarMedia(ownerUserId: string, paleta: Paleta, semente: number) {
  const bytes = gerarPng(720, 720, paleta, semente);
  const storageKey = randomUUID();

  await mkdir(MEDIA, { recursive: true, mode: 0o700 });
  await writeFile(resolve(MEDIA, storageKey), bytes, { mode: 0o600 });

  return {
    id: randomUUID(),
    ownerUserId,
    storageKey,
    // PNG, porque é PNG que se gera. O tipo declarado tem de corresponder aos
    // bytes — é a mesma regra que `validateMediaBytes` impõe no carregamento.
    mimeType: 'image/png' as const,
    byteSize: bytes.length,
    bytes,
  };
}

export async function semearCriadores(prisma: PrismaClient): Promise<number> {
  let publicadas = 0;

  for (const [indice, criador] of CRIADORES.entries()) {
    const existente = await prisma.user.findUnique({ where: { id: criador.id } });

    // A semente corre vezes sem conta. Não duplica dados, mas atualiza os
    // campos visuais para uma base criada por uma versão anterior da seed.
    if (existente) {
      const perfil = await prisma.profile.findUnique({ where: { userId: criador.id } });
      if (perfil) {
        const settings = perfil.settings && typeof perfil.settings === 'object' && !Array.isArray(perfil.settings)
          ? perfil.settings as Record<string, unknown>
          : {};
        await prisma.profile.update({
          where: { id: perfil.id },
          data: {
            settings: {
              ...settings,
              category: criador.categoria,
              location: criador.cidade,
              avatarUrl: criador.avatarUrl,
              responseTimeHours: [2, 4, 1, 12, 6][indice],
              completedDeals: [48, 31, 76, 19, 54][indice],
              acceptsBrands: indice !== 1,
              verified: indice < 4,
            } as Prisma.InputJsonValue,
          },
        });
      }
      continue;
    }

    await prisma.user.create({
      data: {
        id: criador.id,
        phone: criador.telefone,
        displayName: criador.nome,
        roles: ['CREATOR', 'FAN'],
        verificationLevel: 'PHONE',
        accounts: { create: { type: 'INDIVIDUAL' } },
        profile: {
          create: {
            handle: criador.handle,
            displayName: criador.nome,
            bio: criador.bio,
            publishedAt: new Date(),
            availabilityStatus: criador.disponibilidade ?? 'AVAILABLE',
            settings: {
              category: criador.categoria,
              location: criador.cidade,
              avatarUrl: criador.avatarUrl,
              responseTimeHours: [2, 4, 1, 12, 6][indice],
              completedDeals: [48, 31, 76, 19, 54][indice],
              acceptsBrands: indice !== 1,
              verified: indice < 4,
            },
            offers: {
              create: criador.ofertas.map((oferta) => ({
                kind: oferta.kind,
                title: oferta.title,
                description: oferta.description,
                priceMinor: oferta.precoMinor,
                currency: 'AOA',
                slaHours: oferta.slaHours,
                revisionsIncluded: oferta.revisoes ?? 1,
                requiresBrief: oferta.exigeBrief ?? false,
              })),
            },
          },
        },
      },
    });

    const perfil = await prisma.profile.findUniqueOrThrow({
      where: { handle: criador.handle },
    });

    for (const [n, publicacao] of criador.publicacoes.entries()) {
      const media = await criarMedia(criador.id, publicacao.paleta, indice * 10 + n + 1);

      await prisma.media.create({
        data: {
          id: media.id,
          ownerUserId: media.ownerUserId,
          storageKey: media.storageKey,
          mimeType: media.mimeType,
          byteSize: media.byteSize,
        },
      });

      const item = await prisma.contentItem.create({
        data: {
          profileId: perfil.id,
          kind: 'PHOTO',
          caption: publicacao.legenda,
          visibility: publicacao.paga ? 'PAID' : 'PUBLIC',
          priceMinor: BigInt(publicacao.paga ?? 0),
          currency: 'AOA',
          mediaIds: [media.id],
          previewMediaIds: [],
          status: 'PUBLISHED',
          publishedAt: new Date(Date.now() - (n + 1) * 36e5),
        },
      });

      // O dono vê sempre o que publicou (RN-024).
      await prisma.contentGrant.create({
        data: { contentId: item.id, userId: criador.id, source: 'OWNER', grantedAt: new Date() },
      });

      // Conteúdo pago compra-se como tudo o resto: por um `Deal` sobre uma
      // oferta. Publicar cria-a no caso de uso; aqui a semente espelha-o.
      if (publicacao.paga) {
        await prisma.offer.create({
          data: {
            profileId: perfil.id,
            kind: 'CONTENT_UNLOCK',
            title: publicacao.legenda,
            priceMinor: BigInt(publicacao.paga),
            currency: 'AOA',
            slaHours: 1,
            revisionsIncluded: 0,
            requiresBrief: false,
            contentItemId: item.id,
          },
        });
      }

      publicadas += 1;
    }
  }

  return publicadas;
}
