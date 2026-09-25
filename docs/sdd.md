# NaDM — Documento de Desenho do Sistema

Versão 1.0 · 17 de Setembro de 2026 · Estado: rascunho para revisão

---

## 1. Contexto e objectivo do sistema

### 1.1 O problema

Um criador angolano com audiência numa rede social não tem hoje onde transformar essa audiência em receita sem sair da plataforma. O fluxo real parte-se em quatro ferramentas desligadas: o pedido chega por mensagem directa, o pagamento acontece por transferência com comprovativo em fotografia, a conversa fica dispersa, e a entrega vai por link temporário. Ninguém consegue dizer, passados três meses, o que foi vendido, o que foi pago e o que ficou por entregar.

### 1.2 O que a NaDM é

A NaDM é a camada comercial da presença online de uma pessoa. Alguém descobre um criador numa rede social, entra no perfil NaDM e ali vê conteúdo, faz um pedido, paga, conversa e recebe a entrega.

### 1.3 A decisão central de desenho

**Pedido, pagamento, conversa e entrega são a mesma entidade.** No modelo chama-se `Deal`.

Não existe uma tabela de pedidos que aponta para uma tabela de conversas que aponta para uma tabela de pagamentos. Existe um `Deal` que tem estado comercial, estado de dinheiro, mensagens e entregas como partes suas. Consequências práticas desta decisão, que atravessam todo o documento:

- Não há conversa sem `Deal`. Uma pergunta antes de comprar é um `Deal` em estado `PROPOSED` com valor zero ou com o valor da oferta de mensagem directa.
- Não há pagamento órfão. Um `PaymentIntent` nasce sempre ligado a um `Deal`.
- Não há entrega sem contexto. Um ficheiro entregue pertence ao `Deal` e herda a sua regra de acesso.
- A autorização é uma pergunta única e repetida: *este utilizador é parte deste `Deal`?* Responder a isso resolve o acesso a mensagens, ficheiros, pagamentos e histórico de uma só vez.

### 1.4 Fronteiras do sistema

**Dentro:** perfis públicos, catálogo de ofertas, conteúdo pago, ciclo de vida do `Deal`, retenção e libertação de dinheiro, carteira e levantamentos, mensagens, entregas, avaliações, facturação a empresas, verificação de identidade, disponibilidade e vagas, administração da plataforma.

**Fora, nesta versão:** aplicação móvel nativa, directos em vídeo, mercado entre criadores, publicidade paga, programa de afiliados, marcação com sincronização de calendário externo.

### 1.5 Mercado e moeda

Mercado inicial: Angola. Moeda única: Kwanza (`AOA`), representada sempre em cêntimos como inteiro. Pagamentos por MULTICAIXA Express através de um parceiro de pagamentos ainda por fechar contratualmente — a integração fica atrás de uma interface, com uma implementação falsa utilizável em desenvolvimento e testes.

### 1.6 Objectivos mensuráveis

| Objectivo | Medida |
|---|---|
| Ciclo completo sem sair da plataforma | ≥ 90% dos `Deal` pagos concluem sem contacto fora da NaDM |
| Confiança no dinheiro | 100% dos movimentos reconciliáveis com o parceiro; divergência não resolvida ≤ 24 h |
| Tempo até ao primeiro pedido | Criador cria perfil, oferta e recebe primeiro pedido no mesmo dia |
| Acesso indevido a conteúdo pago | Zero. Qualquer ocorrência é incidente de severidade máxima |

---

## 2. Stack detectada e convenções adoptadas

A stack está decidida e inicializada no repositório. Este capítulo regista o que foi detectado; não propõe alternativas.

### 2.1 Versões detectadas

| Peça | Versão | Onde |
|---|---|---|
| NestJS (core, common, platform-express) | 11.2.5 | `apps/api` |
| @nestjs/config | 4.0.4 | `apps/api` |
| Prisma + @prisma/client | 6.19.3 | `apps/api`, provider `postgresql` |
| Zod | 3.25.76 | `apps/api`, `apps/web` |
| Vitest | 2.1.9 | ambas as apps |
| unplugin-swc | 1.5.x | `apps/api` — transpila decoradores para o Vitest |
| supertest | 7.x | `apps/api` — testes de rota |
| Next.js | 15.5.25 | `apps/web`, App Router, `typedRoutes` activo |
| React | 19.3.0 | `apps/web` |
| Tailwind CSS | 4.3.3 | `apps/web`, via `@tailwindcss/postcss` |
| Testing Library + jsdom | 16.x / 25.x | `apps/web` |

**Autenticação: nenhum pacote instalado.** Não há `passport`, `jwt`, `bcrypt`, `argon2` nem equivalente. O desenho abaixo assume um `AuthContext` com `userId` e papéis, e descreve o que cada regra precisa dele, mas o mecanismo concreto é **decisão pendente DP-01** (capítulo 18).

### 2.2 Organização do repositório

```
nadm/
├── apps/
│   ├── api/                 NestJS + Prisma + Zod
│   │   ├── prisma/schema.prisma
│   │   └── src/
│   │       ├── core/        infra transversal, sem domínio
│   │       ├── modules/     um directório por módulo de domínio
│   │       ├── app.module.ts
│   │       └── main.ts
│   └── web/                 Next.js App Router
│       └── src/app/
└── docs/sdd.md
```

### 2.3 Convenções já materializadas em `src/core`

Estas não são propostas — já existem em código e o resto do sistema segue-as.

- **Configuração** — `core/config/env.ts` valida o ambiente com Zod e falha o arranque com a lista de variáveis inválidas. Nada lê `process.env` directamente fora daqui.
- **Base de dados** — `core/database/prisma.service.ts` estende `PrismaClient` com `onModuleInit`/`onModuleDestroy`; `PrismaModule` é `@Global()`.
- **Erros** — `core/errors/domain-error.ts` define `DomainError` e as subclasses `ResourceNotFoundError`, `ResourceConflictError`, `BusinessRuleError`. O domínio não conhece HTTP.
- **Mapeamento HTTP** — `core/http/domain-exception.filter.ts` traduz `DomainError` em estado HTTP: não encontrado → 404, conflito → 409, regra de negócio → 422, restante → 400.
- **Validação de entrada** — `core/http/zod-validation.pipe.ts` valida corpo, parâmetros e query com Zod, devolve `issues[]` com todos os campos em falha e remove chaves não declaradas.
- **Prefixo HTTP** — todas as rotas sob `/api`.
- **Alias** — `@/*` aponta para `apps/api/src/*` (espelhado no `tsconfig` e no `vitest.config.ts`).

### 2.4 Convenção de módulo de domínio

Cada módulo segue a mesma forma. O `Deal` serve de exemplo:

```
src/modules/deals/
├── domain/
│   ├── deal.ts                     entidade, invariantes, transições
│   ├── money.ts                    value object
│   └── errors.ts                   erros do módulo, estendem DomainError
├── application/
│   ├── ports/                      interfaces que a aplicação precisa
│   │   ├── deals.repository.ts
│   │   └── payments.gateway.ts
│   └── use-cases/
│       ├── accept-deal.use-case.ts
│       └── accept-deal.use-case.spec.ts
├── infra/
│   ├── prisma/prisma-deals.repository.ts
│   └── payments/{multicaixa,fake}-payments.gateway.ts
├── http/
│   ├── deals.controller.ts
│   ├── schemas/accept-deal.schema.ts
│   └── presenters/deal.presenter.ts
└── deals.module.ts
```

Regras que daqui decorrem:

1. **Um caso de uso é uma classe com um método `execute`.** Sem lógica de negócio em controladores; o controlador valida, chama, apresenta.
2. **O caso de uso depende de portas, nunca do Prisma.** O Prisma vive em `infra/`.
3. **Gateways externos têm sempre duas implementações**, a real e a falsa, escolhidas por variável de ambiente.
4. **O teste fica ao lado do ficheiro testado**, com sufixo `.spec.ts`, e é recolhido por `src/**/*.spec.ts`.
5. **Identificadores, tabelas e rotas em inglês.** Documentação e mensagens ao utilizador em português.

### 2.5 Convenções de dados

- Modelos Prisma em `PascalCase` singular, tabelas em `snake_case` plural via `@@map`.
- Chaves primárias: `String @id @default(uuid()) @db.Uuid`. Nunca inteiros sequenciais em recurso exposto.
- `createdAt`/`updatedAt` em todas as tabelas, `timestamptz`.
- Apagar é marcar `deletedAt` em tudo o que seja conteúdo de utilizador. Registos de dinheiro nunca são apagados nem alterados.
- Dinheiro: `BigInt` em cêntimos + coluna de moeda. Nunca `Float`, nunca `Decimal` implícito.

---

## 3. Actores, papéis e permissões

### 3.1 Actores

| Actor | Quem é | O que precisa |
|---|---|---|
| **Criador** | Profissional que vende acesso, conteúdo e serviços | Publicar, definir ofertas e preços, aceitar ou recusar pedidos, entregar, levantar dinheiro |
| **Marca** | Empresa que contrata um criador | Contratar em nome da empresa, receber documento fiscal com NIF |
| **Fã** | Pessoa singular que compra | Descobrir, comprar, conversar, receber, avaliar |
| **Administração** | Equipa da plataforma | Resolver disputas, verificar identidades, reconciliar dinheiro, suspender contas |

### 3.2 Papéis no modelo

Um `User` é a identidade autenticável. Um `Profile` é a presença pública de um criador. Um `Account` de tipo `BRAND` representa uma empresa e agrupa utilizadores.

```
Role ∈ { FAN, CREATOR, BRAND_MEMBER, BRAND_OWNER, ADMIN, SUPPORT }
```

Um utilizador pode acumular papéis: quem vende também compra. O papel não chega para autorizar — a maioria das decisões depende de relação com o recurso, não de papel. Ver capítulo 10.

### 3.3 Matriz de permissões de alto nível

| Acção | Fã | Criador | Marca | Admin |
|---|:--:|:--:|:--:|:--:|
| Ver perfil público e conteúdo público | ✔ | ✔ | ✔ | ✔ |
| Criar `Deal` sobre uma oferta | ✔ | — ¹ | ✔ | — |
| Aceitar, recusar ou contrapropor | — | ✔ ² | — | — |
| Enviar mensagem no `Deal` | ✔ ³ | ✔ ³ | ✔ ³ | ✔ ⁴ |
| Submeter entrega | — | ✔ ² | — | — |
| Aprovar entrega | ✔ ³ | — | ✔ ³ | ✔ ⁴ |
| Abrir disputa | ✔ ³ | ✔ ³ | ✔ ³ | — |
| Decidir disputa | — | — | — | ✔ |
| Ver carteira e movimentos | — | ✔ ⁵ | — | ✔ ⁴ |
| Pedir levantamento | — | ✔ ⁵ ⁶ | — | — |
| Emitir documento fiscal | — | automático | recebe | ✔ |
| Verificar identidade de terceiro | — | — | — | ✔ |
| Suspender conta | — | — | — | ✔ |

¹ Um criador pode comprar a outro criador; nesse `Deal` age como fã.
² Apenas no `Deal` de que é o criador destinatário.
³ Apenas se for parte do `Deal`.
⁴ Apenas com disputa aberta ou investigação registada, e sempre com registo de auditoria. Ver RN-064.
⁵ Apenas da sua própria carteira.
⁶ Exige identidade verificada. Ver RN-051.

---

## 4. Domínio: entidades, relações e invariantes

### 4.1 Mapa de agregados

Quatro agregados. As fronteiras importam: dentro de um agregado, consistência imediata numa transacção; entre agregados, referência por identificador e consistência por evento.

```
┌─ IDENTITY ────────────┐   ┌─ PRESENCE ─────────────────┐
│ User                  │   │ Profile (raiz)             │
│ Account               │   │  ├ Post ─ Media            │
│ IdentityVerification  │   │  ├ Playlist ─ PlaylistItem │
└───────────────────────┘   │  ├ Offer                   │
                            │  ├ AvailabilityWindow      │
                            │  └ Review (agregada)       │
                            └────────────────────────────┘
┌─ DEAL (raiz) ─────────────────────┐   ┌─ LEDGER ──────────────┐
│ Deal                              │   │ LedgerTransaction     │
│  ├ Message ─ MessageAttachment    │   │  └ LedgerEntry        │
│  ├ Delivery ─ DeliveryAsset       │   │ Wallet (projecção)    │
│  ├ PaymentIntent ─ PaymentEvent   │   │ Payout                │
│  ├ Dispute                        │   │ Invoice ─ InvoiceLine │
│  └ Review (uma, do comprador)     │   └───────────────────────┘
└───────────────────────────────────┘
```

O `Deal` e o `Ledger` são agregados distintos por uma razão deliberada: o razão contabilístico é imutável e tem o seu próprio ciclo de reconciliação, e não pode ser reescrito por uma correcção no ciclo comercial.

### 4.2 Entidades

#### User
Identidade autenticável. `id`, `phone` (E.164, `+244…`, único), `email` (opcional, único), `displayName`, `roles[]`, `status ∈ {ACTIVE, SUSPENDED, DELETED}`, `verificationLevel ∈ {NONE, PHONE, IDENTITY}`.

*Invariantes:* telefone único e normalizado em E.164 antes de gravar; utilizador suspenso não cria `Deal` nem levanta dinheiro, mas continua a ver histórico.

#### Account
Entidade contratante quando a compra é feita por uma empresa. `id`, `type ∈ {INDIVIDUAL, BRAND}`, `legalName`, `taxId` (NIF), `address`, `ownerUserId`.

*Invariantes:* `type = BRAND` exige `taxId` e `legalName` preenchidos (RN-070); todo o `User` tem exactamente uma `Account` de tipo `INDIVIDUAL` criada no registo.

#### Profile
Presença pública do criador. `id`, `userId` (único), `handle` (único, minúsculas, `[a-z0-9_]{3,30}`), `displayName`, `bio`, `avatarMediaId`, `coverMediaId`, `category`, `availabilityStatus`, `responseTimeHours`, `publishedAt`.

*Invariantes:* `handle` imutável após 30 dias da criação (RN-010); perfil sem oferta publicada e sem publicação não pode ser publicado (RN-011); `handle` não pode colidir com rotas reservadas (`api`, `admin`, `login`, `settings`, `about`).

#### Post
Unidade de conteúdo. `id`, `profileId`, `kind ∈ {TEXT, IMAGE, VIDEO, AUDIO}`, `title`, `body`, `visibility ∈ {PUBLIC, LOCKED, MEMBERS}`, `priceMinor`, `currency`, `publishedAt`, `deletedAt`.

*Invariantes:* `visibility = LOCKED` exige `priceMinor > 0` (RN-020); `visibility = MEMBERS` exige que o perfil tenha pelo menos uma oferta de tipo `MEMBERSHIP` activa (RN-021); mudar de `LOCKED` para `PUBLIC` não revoga `ContentGrant` já concedidos (RN-022).

#### Playlist e PlaylistItem
Colecção ordenada de `Post`. `Playlist`: `id`, `profileId`, `title`, `visibility`, `priceMinor`. `PlaylistItem`: `playlistId`, `postId`, `position`.

*Invariantes:* `position` único por playlist; a playlist só contém posts do mesmo perfil; comprar uma playlist concede `ContentGrant` a todos os posts que ela continha **no momento da compra** — itens adicionados depois não são concedidos retroactivamente (RN-023).

#### Media
Ficheiro armazenado. `id`, `ownerProfileId`, `storageKey` (opaco, UUID, nunca derivado do nome original), `mimeType`, `sizeBytes`, `durationSeconds`, `checksumSha256`, `status ∈ {UPLOADING, SCANNING, READY, REJECTED}`, `visibilityScope ∈ {PUBLIC_ASSET, PROTECTED}`.

*Invariantes:* `storageKey` nunca é exposto ao cliente (RN-080); media `PROTECTED` só é servida por URL assinada de curta duração (RN-081); media só passa a `READY` depois de análise de conteúdo concluída.

#### Video
Especialização de `Media` com derivações. `mediaId`, `renditions[]` (resolução, bitrate, `storageKey`), `posterMediaId`, `transcodeStatus`.

*Invariantes:* cada derivação herda o `visibilityScope` do original; nenhuma derivação é pública se o original é protegido.

#### Offer
O que o criador vende. `id`, `profileId`, `kind`, `title`, `description`, `priceMinor`, `currency`, `slaHours`, `revisionsIncluded`, `requiresBrief`, `slotsTotal`, `slotsTaken`, `status ∈ {DRAFT, ACTIVE, PAUSED, ARCHIVED}`.

```
OfferKind ∈ {
  DIRECT_MESSAGE,   resposta pessoal por mensagem
  CONTENT_UNLOCK,   desbloqueio de post ou playlist
  MEMBERSHIP,       acesso recorrente ao conteúdo MEMBERS
  CUSTOM_SERVICE,   trabalho sob encomenda com prazo
  BOOKING           sessão marcada, consome vaga
}
```

*Invariantes:* `priceMinor ≥ 0` e `currency = 'AOA'` (RN-030); `slotsTaken ≤ slotsTotal` quando `slotsTotal` não é nulo (RN-031); arquivar uma oferta não afecta `Deal` já em curso, que mantêm o preço e as condições acordadas (RN-032).

#### Deal — a raiz
A entidade central. Pedido, pagamento, conversa e entrega.

`id`, `reference` (legível, `NDM-2026-0001234`, único), `buyerUserId`, `buyerAccountId`, `creatorProfileId`, `offerId`, `offerSnapshot` (JSON imutável), `status`, `escrowStatus`, `amountMinor`, `platformFeeMinor`, `creatorNetMinor`, `currency`, `brief`, `dueAt`, `expiresAt`, `acceptedAt`, `deliveredAt`, `approvedAt`, `settledAt`, `lastMessageAt`.

*Invariantes:*
- `buyerUserId ≠ Profile(creatorProfileId).userId` — ninguém compra a si próprio (RN-040).
- `offerSnapshot` é escrito na criação e nunca mais muda. O preço do `Deal` é o do snapshot, mesmo que a oferta mude depois (RN-041).
- `amountMinor = platformFeeMinor + creatorNetMinor`, sempre, em inteiros (RN-042).
- `escrowStatus` só sai de `PENDING` com um `PaymentIntent` capturado (RN-043).
- `status` só muda por uma transição declarada no capítulo 5. Qualquer outra tentativa é `BusinessRuleError`.

#### Message e MessageAttachment
`Message`: `id`, `dealId`, `senderUserId`, `kind ∈ {TEXT, SYSTEM, ATTACHMENT, STATE_CHANGE}`, `body`, `readAt`, `createdAt`.

*Invariantes:* `senderUserId` é parte do `Deal` ou é `ADMIN` com disputa aberta (RN-060); mensagens `SYSTEM` e `STATE_CHANGE` são escritas pelo sistema e não são editáveis nem apagáveis; anexo aponta para `Media` de escopo `PROTECTED` (RN-061).

#### Delivery e DeliveryAsset
`Delivery`: `id`, `dealId`, `version`, `note`, `submittedAt`, `acceptedAt`, `rejectedAt`, `rejectionReason`.

*Invariantes:* `version` incrementa por `Deal`; o número de entregas rejeitadas não excede `revisionsIncluded + 1` sem novo acordo (RN-044); os ficheiros da entrega só são acessíveis ao comprador depois de `status = APPROVED`, excepto pré-visualização com marca de água (RN-045).

#### PaymentIntent e PaymentEvent
`PaymentIntent`: `id`, `dealId`, `provider`, `providerReference` (único), `amountMinor`, `currency`, `status ∈ {CREATED, PENDING, CAPTURED, FAILED, EXPIRED, REVERSED}`, `idempotencyKey` (único), `payerPhone`, `expiresAt`.

`PaymentEvent`: registo bruto e imutável de cada notificação do parceiro. `id`, `paymentIntentId`, `providerEventId` (único), `type`, `payload` (JSON), `receivedAt`, `processedAt`.

*Invariantes:* `providerEventId` único impede processar duas vezes a mesma notificação (RN-091); um `Deal` tem no máximo um `PaymentIntent` em `CREATED` ou `PENDING` (RN-092); `CAPTURED` é terminal — uma devolução é uma operação nova, nunca uma reescrita (RN-093).

#### Ledger: LedgerTransaction e LedgerEntry
`LedgerTransaction`: `id`, `kind`, `dealId`, `payoutId`, `occurredAt`, `description`, `externalReference`.
`LedgerEntry`: `id`, `transactionId`, `account`, `subjectType`, `subjectId`, `direction ∈ {DEBIT, CREDIT}`, `amountMinor`, `currency`.

*Invariantes:*
- A soma algébrica das entradas de cada transacção é exactamente zero (RN-100).
- Nenhuma entrada é actualizada ou apagada. Corrigir é lançar transacção de estorno (RN-101).
- `amountMinor > 0` sempre; o sinal está em `direction` (RN-102).

#### Wallet
**Projecção, não fonte de verdade.** `profileId`, `availableMinor`, `reservedMinor`, `pendingMinor`, `currency`, `recomputedAt`.

*Invariante:* o valor de cada campo é igual à soma das entradas do razão para a conta correspondente. Um trabalho de verificação recalcula e alerta em caso de divergência (RN-103). Nenhum caso de uso escreve directamente na `Wallet` sem passar pelo razão.

#### Payout
Levantamento. `id`, `profileId`, `amountMinor`, `feeMinor`, `netMinor`, `method`, `destination` (mascarado nas leituras), `status ∈ {REQUESTED, APPROVED, PROCESSING, PAID, FAILED, CANCELLED}`, `providerReference`, `requestedAt`, `settledAt`.

*Invariantes:* `amountMinor ≤ wallet.availableMinor` no momento do pedido, verificado sobre o razão e não sobre a projecção (RN-050); exige `verificationLevel = IDENTITY` (RN-051); pedido reserva o valor imediatamente, movendo-o de disponível para reservado (RN-052).

#### Invoice e InvoiceLine
Documento fiscal. `id`, `number` (sequencial por série, único), `series`, `accountId`, `dealId`, `issuedAt`, `netMinor`, `taxMinor`, `grossMinor`, `taxRateBp`, `status ∈ {ISSUED, CANCELLED}`, `pdfMediaId`.

*Invariantes:* a numeração é sequencial sem lacunas por série (RN-071); uma factura emitida nunca é alterada — corrige-se por nota de crédito (RN-072); `grossMinor = netMinor + taxMinor` (RN-073).

#### IdentityVerification
`id`, `userId`, `documentType ∈ {BI, PASSPORT, NIF}`, `documentNumber` (cifrado), `frontMediaId`, `backMediaId`, `selfieMediaId`, `status ∈ {PENDING, APPROVED, REJECTED, EXPIRED}`, `reviewerUserId`, `reviewedAt`, `rejectionReason`.

*Invariantes:* apenas o próprio e a administração lêem o registo (RN-062); os ficheiros são `PROTECTED` e nunca entram em pré-visualização pública; aprovar eleva `User.verificationLevel` para `IDENTITY`.

#### AvailabilityWindow
`id`, `profileId`, `offerId`, `startsAt`, `endsAt`, `slotsTotal`, `slotsTaken`, `timezone` (`Africa/Luanda`).

*Invariantes:* janelas do mesmo `offerId` não se sobrepõem (RN-033); `slotsTaken` só aumenta dentro da transacção que cria o `Deal` de tipo `BOOKING` (RN-034).

#### Review
`id`, `dealId` (único), `authorUserId`, `profileId`, `rating` (1–5), `body`, `reply`, `publishedAt`.

*Invariantes:* uma avaliação por `Deal`, escrita pelo comprador (RN-046); só existe com `status ∈ {APPROVED, PAID}` — não se avalia o que não foi entregue (RN-047); o criador pode responder uma vez e não pode apagar a avaliação.

#### ContentGrant
Direito de acesso de um utilizador a conteúdo pago. `id`, `userId`, `subjectType ∈ {POST, PLAYLIST, PROFILE_MEMBERSHIP}`, `subjectId`, `dealId`, `grantedAt`, `expiresAt`.

*Invariante:* é a **única** fonte de verdade para acesso a conteúdo pago. Nenhum caminho de leitura decide acesso por outro meio (RN-024).

### 4.3 Value objects

**Money** — `{ amountMinor: bigint, currency: 'AOA' }`. Imutável. Soma e subtracção exigem a mesma moeda. Divisão devolve as parcelas e o resto, e o resto é atribuído deterministicamente à primeira parcela; nunca se perde um cêntimo (RN-110).

**Handle** — minúsculas, `[a-z0-9_]{3,30}`, não reservado.

**PhoneNumber** — E.164 com prefixo `+244` na versão inicial.

**DealReference** — `NDM-{ano}-{sequência}`, gerada por sequência em base de dados, exposta ao utilizador em vez do UUID.

---

## 5. Máquinas de estado

Cada transição tem dono, condição de entrada e efeito. O que não está na tabela não é transição válida: a tentativa levanta `BusinessRuleError` e é registada.

### 5.1 Deal — estado comercial

> **Esta secção foi reescrita depois de F1 e F4.** Três decisões tomadas durante
> a implementação mudaram-na, e todas as três foram ganhas pelo design contra o
> desenho original: DP-15 (paga-se antes de o criador aceitar), DP-07 (a taxa é
> 5% de cada lado) e DP-16 (a contraproposta acerta o escrow). O registo de cada
> uma está em `docs/plano.md`. O que se segue é o que está implementado.

```
                        ┌──────────────┐
                        │   PROPOSED   │◄──────┐
                        │  ┌────────┐  │       │ T5 contraproposta aceite
                        │  │ escrow │  │       │    (e escrow acertado)
                        │  │PENDING │  │       │
                        │  │   ou   │  │       │
                        │  │  HELD  │  │       │
                        │  └────────┘  │       │
                        └──────┬───────┘       │
           ┌───────────────────┼───────────────┴────────┐
           │ T3                │ T2                     │ T4
     ┌─────▼─────┐      ┌──────▼──────┐        ┌────────▼────────┐
     │ DECLINED  │      │  ACCEPTED   │        │ COUNTER_OFFERED │
     └───────────┘      └──────┬──────┘        └────────┬────────┘
       (terminal)              │ T8                     │ T6
                               │                        ▼
                               │                   DECLINED
                        ┌──────▼──────┐
                        │  DELIVERED  │───┐ T11 rejeitada, com revisões
                        └──────┬──────┘   └──► IN_PROGRESS ──T8──┐
                               │ T9 comprador aprova             │
                               │ T10 ou 72 h sem resposta        │
                        ┌──────▼──────┐                          │
                        │  APPROVED   │◄─────────────────────────┘
                        └──────┬──────┘
                               │ T12 libertação do escrow
                        ┌──────▼──────┐
                        │    PAID     │  (terminal)
                        └─────────────┘

     Saídas transversais:  EXPIRED (T13)   REFUNDED (T15, T16)
```

**`PROPOSED` tem duas caras, e é o escrow que as distingue.** Por pagar, com o
escrow em `PENDING`, é um pedido que o criador ainda não pode decidir. Pago, com
o escrow em `HELD`, é um pedido à espera dele. O estado comercial é o mesmo nas
duas — é a separação das duas máquinas de estado a fazer o seu trabalho, e é o
que evita um estado combinado do género `PROPOSED_BUT_UNPAID`.

**`ACCEPTED` e `IN_PROGRESS` não são dois passos.** Aceitar já é começar: o
dinheiro está retido desde o pagamento e não há acção nenhuma entre uma coisa e
outra. O «em execução» do design é uma leitura do tempo decorrido contra o
prazo, não um estado à parte. `IN_PROGRESS` só se alcança por T11, quando uma
entrega rejeitada devolve o trabalho ao criador.

#### Tabela de transições

| # | De | Para | Quem acciona | Condição | Efeito |
|---|---|---|---|---|---|
| T1 | — | `PROPOSED` | Comprador | Oferta `ACTIVE`, vaga disponível se `BOOKING` | Cria `Deal`, congela `offerSnapshot`, abre a conversa, define `expiresAt` |
| T2 | `PROPOSED` | `ACCEPTED` | Criador | **Escrow em `HELD`** e dentro de `expiresAt` | Arranca `dueAt = agora + slaHours`, notifica comprador |
| T3 | `PROPOSED` | `DECLINED` | Criador | — | **Estorna o escrow (E3)**, liberta vaga, fecha a conversa a novas mensagens |
| T4 | `PROPOSED` | `COUNTER_OFFERED` | Criador | Escrow em `HELD`; preço ou prazo diferentes do proposto | Regista `DealCounterOffer`; **o prazo passa a ser do comprador**. Não move dinheiro |
| T5 | `COUNTER_OFFERED` | `PROPOSED` | Comprador | Aceita os termos novos, **e o escrow vale o preço novo** | Substitui `offerSnapshot` e reparte o valor novo; acerta o escrow. Ver §5.2 |
| T6 | `COUNTER_OFFERED` | `DECLINED` | Comprador | Recusa | **Estorna o escrow (E3)**, liberta vaga |
| T8 | `ACCEPTED` \| `IN_PROGRESS` | `DELIVERED` | Criador | Existe `Delivery` com pelo menos um `DeliveryAsset` ou nota | Inicia prazo de aprovação automática |
| T9 | `DELIVERED` | `APPROVED` | Comprador | — | Concede `ContentGrant`, liberta ficheiros |
| T10 | `DELIVERED` | `APPROVED` | **Sistema** | Passaram 72 h sem acção do comprador | Aprovação automática, registada como acto do sistema |
| T11 | `DELIVERED` | `IN_PROGRESS` | Comprador | Revisões disponíveis, motivo preenchido | Marca entrega como rejeitada, `dueAt` novo contado da rejeição |
| T12 | `APPROVED` | `PAID` | **Sistema** | Escrow `HELD`, sem disputa aberta | Liberta escrow, lança razão, actualiza carteira |
| T13 | `PROPOSED` \| `COUNTER_OFFERED` | `EXPIRED` | **Sistema** | Passou `expiresAt` sem resposta | **Estorna o escrow (E3) se estava pago, ou fecha-o (E4) se não**; notifica ambas as partes |
| T15 | `ACCEPTED` \| `IN_PROGRESS` \| `DELIVERED` | `REFUNDED` | **Admin** | Disputa decidida a favor do comprador | Devolve escrow (E3), lança razão, escreve a decisão na conversa |
| T16 | `ACCEPTED` \| `IN_PROGRESS` | `REFUNDED` | Comprador | `dueAt` ultrapassado em mais de 48 h sem entrega **e o comprador pede** | Devolve escrow (E3) |

**T7 e T14 deixaram de existir com DP-15.** T7 era `ACCEPTED → IN_PROGRESS` por
captura do pagamento; com o pagamento à cabeça, aceitar já é começar. T14 era a
expiração de `ACCEPTED` por falta de pagamento; não há pagamento depois de
aceitar, e uma intenção que expira deixa o pedido em `PROPOSED` por pagar, onde
T13 o apanha. Os números não foram reatribuídos — reutilizá-los tornaria
ilegível qualquer registo de auditoria escrito antes desta reescrita.

**T16 mudou de dono.** Era do sistema; é do comprador. O direito nasce do tempo,
mas a devolução não é automática: um criador atrasado que entregue antes de lhe
pedirem a devolução continua a receber. É a diferença entre um prazo falhado e
um negócio falhado.

#### Prazos e o que acontece quando expiram

| Prazo | Duração | Configurável por | Consequência da inacção |
|---|---|---|---|
| Resposta do criador à proposta | 48 h | `PricingPolicy`, 12–120 h | T13 → `EXPIRED`, com estorno se estava pago |
| Resposta do comprador à contraproposta | 48 h | `PricingPolicy` | T13 → `EXPIRED`, com estorno |
| Pagamento da proposta | `PaymentIntent.expiresAt` | Parceiro | A intenção expira; o pedido fica em `PROPOSED` por pagar até T13 |
| Entrega | `offer.slaHours` | Oferta | Passadas mais 48 h, o comprador ganha direito a pedir devolução (T16) |
| Aprovação após entrega | 72 h | `PricingPolicy` | T10 → `APPROVED` automático |
| Abertura de disputa após aprovação | 0 h | — | Aprovado é definitivo. Ver DP-05 |

Nenhum destes prazos é lido do relógio do sistema dentro do domínio: o `Clock` é
injectado, e é por isso que um teste avança 72 horas sem esperar 72 horas. Quem
acciona T13 e T10 é um varrimento periódico, um pedido por transacção, retomável
sem guardar estado sobre si próprio.

#### Estados terminais
`DECLINED`, `EXPIRED`, `PAID`, `REFUNDED`. Em `PAID` e `REFUNDED` a conversa fica legível mas fechada a novas mensagens ao fim de 30 dias.

### 5.2 Escrow — estado do dinheiro

```
PENDING ──captura──► HELD ──┬──libertação──► RELEASED  (terminal)
   │                        │
   │                        └──devolução───► REFUNDED  (terminal)
   └──falha/expiração──► FAILED (terminal)
```

| # | De | Para | Quem | Condição | Lançamento no razão |
|---|---|---|---|---|---|
| E1 | `PENDING` | `HELD` | Sistema, por notificação do parceiro | `PaymentEvent` de captura válido e não processado | DÉBITO `PROVIDER_CLEARING` / CRÉDITO `ESCROW` |
| E2 | `HELD` | `RELEASED` | Sistema, em T12 | `Deal` em `APPROVED`, sem disputa | DÉBITO `ESCROW` / CRÉDITO `CREATOR_AVAILABLE` + DÉBITO da taxa do criador + CRÉDITO `PLATFORM_FEE_REVENUE` |
| E3 | `HELD` | `REFUNDED` | Sistema, em T3, T6, T13 e T16; admin em T15 | Recusa, expiração, atraso ou disputa decidida | DÉBITO `ESCROW` / CRÉDITO `REFUNDS_PAYABLE` |
| E4 | `PENDING` | `FAILED` | Sistema, em T3 e T13 | O pedido morreu sem nunca ter sido pago | Nenhum — não há dinheiro para mover |

**E1 não é opcional.** Sem a entrada da captura, a conta `ESCROW` seria debitada
na libertação sem nunca ter sido creditada, e o saldo por `Deal` ficaria
permanentemente negativo. Foi um defeito real de F1, corrigido em F4.

#### O acerto da contraproposta — **não é uma transição de escrow**

Aceitar uma contraproposta (T5) muda o valor do `Deal`, e o escrow tem de passar
a valer o valor novo. Mas o escrow **continua em `HELD`** em todos os casos: o
que muda é quanto lá está.

| Preço novo | O que acontece | Lançamento |
|---|---|---|
| sobe | O comprador reforça a diferença, e **é a captura do reforço que dispara T5**. Até pagar, o pedido fica em `COUNTER_OFFERED` | `ESCROW_TOP_UP`: DÉBITO `PROVIDER_CLEARING` / CRÉDITO `ESCROW`, pela diferença |
| desce | Estorno parcial, na mesma transacção que T5 | `COUNTER_OFFER_REFUND`: DÉBITO `ESCROW` / CRÉDITO `REFUNDS_PAYABLE`, pela diferença |
| igual | Só o prazo mudou | Nenhum |

O reforço usa a mecânica do pagamento inicial — `PaymentIntent` com
`purpose = TOP_UP` — e não inventa mecanismo nenhum. É isso que mantém a ordem
de DP-15 intacta: **o dinheiro primeiro, o estado depois**.

**O invariante que isto protege:** um `Deal` em `PROPOSED` com escrow `HELD` tem
no escrow exactamente `amountMinor`. É o que torna T2 seguro — o criador nunca
aceita trabalho cujo pagamento não esteja inteiro.

**Regra de acoplamento:** o estado do dinheiro nunca se move por acção directa de um utilizador. Move-se por consequência de uma transição do `Deal` ou de uma notificação do parceiro. Não existe rota que liberte escrow.

### 5.3 Conteúdo — acesso

O estado do conteúdo e o direito de acesso são coisas separadas, de propósito.

| Estado do `Post` | Significado | Quem vê o corpo completo |
|---|---|---|
| `PUBLIC` | Aberto | Toda a gente |
| `LOCKED` | Bloqueado com preço | Quem tem `ContentGrant` sobre o post ou sobre a playlist que o continha |
| `MEMBERS` | Incluído para membros | Quem tem `ContentGrant` de tipo `PROFILE_MEMBERSHIP` válido e não expirado |

```
PUBLIC ◄──► LOCKED ◄──► MEMBERS      (criador, a qualquer momento)
                │
                └── compra ──► ContentGrant(user, post)   (permanente)
```

*Regra:* despromover de `LOCKED` para `PUBLIC` não revoga `ContentGrant`; promover de `PUBLIC` para `LOCKED` não concede nada a quem já tinha visto. O que foi comprado fica comprado (RN-022).

### 5.4 Disponibilidade

```
AVAILABLE ──slotsTaken = slotsTotal──► NO_SLOTS ──vaga libertada──► AVAILABLE
    │                                      │
    └──────── criador pausa ───────────────┴──► PAUSED ──criador retoma──► AVAILABLE ou NO_SLOTS
```

`NO_SLOTS` é derivado e recalculado **a cada leitura**, nunca guardado — ver
`derivedAvailability`. `PAUSED` é uma decisão explícita do criador e tem
precedência sobre o derivado. Um perfil em `PAUSED` continua visível e o
conteúdo continua acessível; apenas não aceita novos `Deal`.

**O derivado não bloqueia ao nível do perfil.** `NO_SLOTS` é uma propriedade de
uma oferta de marcação, e esgotar as vagas de uma não pode impedir alguém de
contratar outra que nem vagas tem. Quem recusa por falta de vaga é a janela, na
transacção que cria o `Deal` (RN-034); `acceptsNewDeals` só olha para `PAUSED`.

---

## 6. Casos de uso principais

Notação: **N** fluxo normal, **A** alternativo, **E** erro. Cada caso de uso corresponde a uma classe em `application/use-cases` e a um ficheiro `.spec.ts` ao lado.

### UC-01 · Publicar perfil de criador
*Actor:* Criador · *Pré:* utilizador autenticado com telefone verificado

**N** 1. Escolhe `handle` disponível. 2. Preenche nome, bio e categoria. 3. Carrega avatar. 4. Cria pelo menos uma oferta. 5. Publica; `publishedAt` é preenchido e o perfil passa a resolver em `/{handle}`.
**A1** Handle ocupado: o sistema sugere três alternativas derivadas.
**A2** Publica sem avatar: permitido, fica com iniciais geradas.
**E1** Sem oferta nem publicação → 422 `BusinessRuleError` (RN-011).
**E2** Handle reservado → 409 `ResourceConflictError`.

### UC-02 · Descobrir um perfil e o seu catálogo
*Actor:* Qualquer, sem autenticação

**N** 1. Abre `/{handle}`. 2. Vê cabeçalho, ofertas activas, publicações públicas, avaliações e estado de disponibilidade. 3. Conteúdo `LOCKED` aparece com pré-visualização desfocada e preço.
**A1** Autenticado com `ContentGrant`: vê o conteúdo completo, sem pagar de novo.
**A2** Perfil em `PAUSED`: vê tudo, com aviso e botões de compra desactivados.
**E1** Handle inexistente ou perfil não publicado → 404.

### UC-03 · Criar um pedido
*Actor:* Fã ou Marca · *Pré:* autenticado

**N** 1. Escolhe oferta. 2. Preenche o brief se exigido. 3. Confirma preço, prazo e revisões. 4. Sistema cria `Deal` em `PROPOSED` com `offerSnapshot` congelado, abre a conversa e notifica o criador.
**A1** Oferta `BOOKING`: escolhe janela, e a vaga é reservada na mesma transacção da criação do `Deal`.
**A2** Marca: escolhe a conta de empresa e o `Deal` fica ligado a ela para efeitos de facturação.
**E1** Oferta pausada ou arquivada → 422 (RN-032).
**E2** Sem vagas → 409 (RN-031).
**E3** Comprar a si próprio → 422 (RN-040).
**E4** Brief exigido e vazio → 400, com `issues[]` do Zod.

### UC-04 · Aceitar, recusar ou contrapor
*Actor:* Criador · *Pré:* é o destinatário do `Deal`, estado `PROPOSED`, **escrow em `HELD`**

O criador só decide sobre pedidos **já pagos** (DP-15). O dinheiro está retido
desde a proposta, e é isso que garante que ninguém trabalha sem garantia.

**N** 1. Lê o brief. 2. Aceita. 3. T2: `dueAt = agora + slaHours` e o comprador é notificado. Não há nada para pagar a seguir.
**A1** Contrapropõe preço ou prazo: T4. O prazo passa a ser do comprador, que aceita (T5) ou recusa (T6). Ver UC-04b.
**A2** Recusa com motivo: T3. O escrow é estornado na mesma transacção (E3) e a vaga libertada.
**E1** Não é o criador do `Deal` → 403.
**E2** `Deal` ainda por pagar → 422 `PaymentRequiredError`. Aceitar exige escrow em `HELD` (RN-043).
**E3** `Deal` já expirado → 422, com o estado actual na mensagem.
**E4** Aceitar duas vezes → 422; a segunda chamada é rejeitada por transição inválida.

### UC-04b · Responder a uma contraproposta
*Actor:* Comprador · *Pré:* é o comprador do `Deal`, estado `COUNTER_OFFERED`

**N** 1. Vê o preço e o prazo pedidos. 2. Aceita. 3. O sistema compara o valor novo com o que está retido:
  - **igual ou mais baixo** — T5 acontece já; se mais baixo, com estorno parcial na mesma transacção;
  - **mais alto** — a resposta diz quanto falta reforçar e **nada transita**. O comprador paga o reforço (UC-05), e é a captura que faz T5 acontecer.
**A1** Recusa: T6 → `DECLINED`, com estorno total do que tinha pago (E3).
**A2** Não responde dentro do prazo: T13 → `EXPIRED`, com estorno.
**E1** Não é o comprador → 403; não é parte nenhuma → 404 (RN-063).
**E2** Não há contraproposta por responder → 409.
**E3** O reforço capturado não é exactamente a diferença em falta → não acerta nada, marca para reconciliação e alerta (RN-094 aplicado ao reforço).

### UC-05 · Pagar por MULTICAIXA Express
*Actor:* Comprador · *Pré:* `Deal` em `PROPOSED` com escrow `PENDING`, ou em `COUNTER_OFFERED` com reforço em falta

**Paga-se antes de o criador aceitar (DP-15).** A sequência do design é briefing
(P6) → pagamento (P7) → pedido criado à espera de decisão (P8).

**N** 1. Confirma o número de telefone. 2. Sistema chama `PaymentsGateway.createIntent` com a `Idempotency-Key` do pedido. 3. O parceiro envia o pedido ao telemóvel. 4. O cliente autoriza. 5. Chega a notificação de captura; o sistema valida a assinatura, regista `PaymentEvent`, lança a entrada no razão e move o escrow para `HELD` (E1). **O estado comercial não muda** — o pedido continua em `PROPOSED`, agora à espera do criador.
**A1** A notificação chega duas vezes: o `providerEventId` único trava a segunda; a resposta é 200 sem efeito (RN-091).
**A2** A notificação não chega: um trabalho periódico consulta o parceiro pelo estado da intenção e concilia.
**A3** O cliente repete o pagamento: a mesma `idempotencyKey` devolve a intenção existente, não cria uma nova (RN-090).
**A4** É o **reforço** de uma contraproposta (`purpose = TOP_UP`): o escrow já está em `HELD` e cresce pela diferença; a captura dispara T5 em vez de E1. Ver UC-04b.
**E1** Autorização recusada: `PaymentIntent → FAILED`, o `Deal` fica em `PROPOSED` por pagar e permite nova tentativa.
**E2** A intenção expira sem autorização: fica `EXPIRED` e o pedido continua por pagar. Quem o fecha é T13, quando o prazo de resposta do criador cair — ou T3, se o criador recusar antes disso.
**E3** Valor capturado diferente do esperado: não move o escrow, marca para reconciliação manual e alerta a administração (RN-094).

### UC-06 · Conversar dentro do pedido
*Actor:* Comprador, Criador · *Pré:* é parte do `Deal`

**N** 1. Escreve mensagem. 2. Sistema grava, actualiza `lastMessageAt`, publica no canal de tempo real e notifica quem está ausente. 3. O destinatário lê e `readAt` é preenchido.
**A1** Anexa ficheiro: cria `Media` `PROTECTED` e liga-o à mensagem.
**A2** Transição de estado ocorre: entra automaticamente uma mensagem `STATE_CHANGE`, para a conversa contar a história completa.
**A3** Admin com disputa aberta entra: as suas mensagens são `SYSTEM` e visíveis a ambos; a entrada fica no registo de auditoria (RN-064).
**E1** Não é parte do `Deal` → 404, não 403, para não confirmar a existência do recurso (RN-063).
**E2** `Deal` terminal há mais de 30 dias → 422, conversa fechada.

### UC-06b · Enviar uma DM gratuita
*Actor:* Comprador, Criador · *Pré:* autenticado; perfil publicado

**N** 1. O comprador abre a DM do perfil. 2. Envia texto. 3. O sistema cria ou reutiliza a conversa única do par e guarda a mensagem. 4. O criador pode responder sem limite nesta conversa.
**A1** O cliente repete o envio com o mesmo `clientId`: recebe a conversa existente e não duplica a mensagem.
**E1** O comprador tenta enviar outra mensagem antes de decorrerem sete dias → 422 com `nextFreeAt` (RN-065).
**E2** Tenta conversar consigo próprio → 403.
**E3** Não é participante da conversa → 404, sem confirmar a sua existência.

`DirectConversation` é separada da conversa do `Deal`: uma DM grátis não cria
escrow, prazo, entrega ou obrigação de resposta. O comprador pode enviar **uma
mensagem a cada sete dias por criador**, sem acumulação; a verificação é
serializada por conversa para duas tentativas simultâneas não atravessarem o
limite (RN-065).

### UC-07 · Entregar
*Actor:* Criador · *Pré:* `Deal` em `ACCEPTED` ou `IN_PROGRESS`

**N** 1. Carrega ficheiros e escreve nota. 2. Submete. 3. T8 → `DELIVERED`; o comprador é notificado e tem 72 h.
**A1** O comprador rejeita com motivo e há revisões disponíveis: T11 → `IN_PROGRESS`, nova versão de entrega.
**A2** O comprador não responde em 72 h: T10 → `APPROVED` automático, registado como acto do sistema.
**E1** Entrega sem ficheiro nem nota → 422.
**E2** Revisões esgotadas → 422 (RN-044); o caminho é a disputa.

### UC-08 · Aprovar e libertar o dinheiro
*Actor:* Comprador ou Sistema · *Pré:* `Deal` em `DELIVERED`

**N** 1. Aprova. 2. T9 → `APPROVED`; `ContentGrant` concedido, ficheiros libertados sem marca de água. 3. T12 e E2: uma transacção do razão debita `ESCROW` e credita o criador pelo **preço anunciado**, debita-lhe a sua metade da taxa e credita `PLATFORM_FEE_REVENUE` — quatro entradas, não três (ver §11.6). 4. `Deal → PAID`. 5. Se a conta é `BRAND`, emite-se a factura.
**A1** Aprovação automática por prazo: mesmo efeito, autor `SYSTEM`.
**E1** Disputa aberta: T12 é bloqueada até decisão (RN-048).
**E2** Falha a meio do lançamento: a transacção de base de dados garante tudo ou nada; o `Deal` fica em `APPROVED` e o trabalho de reconciliação repete a operação, que é idempotente pela chave `ledger:release:{dealId}` (RN-104).

### UC-09 · Comprar conteúdo bloqueado
*Actor:* Fã · *Pré:* post `LOCKED`

**N** 1. Toca no conteúdo desfocado. 2. Sistema cria `Deal` sobre a oferta `CONTENT_UNLOCK`, já em `ACCEPTED` — não há nada para o criador aceitar. 3. Paga (UC-05). 4. Com a captura, a entrega é automática: `ContentGrant` concedido, `Deal` segue `IN_PROGRESS → DELIVERED → APPROVED → PAID` numa só transacção, e a conversa regista as transições.
**A1** Já tem `ContentGrant`: abre directamente, sem criar `Deal`.
**A2** Compra de playlist: `ContentGrant` sobre cada post existente no momento da compra (RN-023).
**E1** Pagamento falha: nenhum `ContentGrant`; o conteúdo continua bloqueado.

### UC-10 · Levantar dinheiro
*Actor:* Criador · *Pré:* identidade verificada

**N** 1. Vê saldo disponível, calculado a partir do razão. 2. Pede levantamento. 3. Sistema valida saldo sobre o razão, cria `Payout` em `REQUESTED` e lança DÉBITO `CREATOR_AVAILABLE` / CRÉDITO `CREATOR_RESERVED`. 4. Administração aprova; envia-se a ordem ao parceiro. 5. Confirmação: `PAID`, lança DÉBITO `CREATOR_RESERVED` / CRÉDITO `PROVIDER_CLEARING`.
**A1** Falha no parceiro: `FAILED` e estorno que devolve o valor a `CREATOR_AVAILABLE`.
**A2** Cancela antes da aprovação: estorno imediato da reserva.
**E1** Saldo insuficiente → 422 (RN-050). A verificação é sobre o razão, nunca sobre a projecção `Wallet`.
**E2** Sem identidade verificada → 403 (RN-051).
**E3** Dois pedidos em paralelo: o bloqueio de linha na conta do criador serializa; o segundo vê o saldo já reduzido e falha (RN-053).

### UC-11 · Abrir e decidir uma disputa
*Actor:* Qualquer parte, depois Admin

**N** 1. Uma parte abre disputa com motivo, em `IN_PROGRESS` ou `DELIVERED`. 2. T12 fica bloqueada. 3. Admin lê a conversa e as entregas. 4. Decide: a favor do criador (desbloqueia T12) ou do comprador (T15 → `REFUNDED`, E3).
**A1** Acordo entre as partes antes da decisão: a disputa fecha e o fluxo normal retoma.
**E1** Disputa depois de `PAID` → 422, fora de prazo. Ver DP-05.
**E2** Abrir segunda disputa no mesmo `Deal` → 409.

### UC-12 · Verificar identidade
*Actor:* Criador, revisto por Admin

**N** 1. Carrega documento e selfie. 2. Estado `PENDING`. 3. Admin aprova; `verificationLevel = IDENTITY` e o levantamento fica desbloqueado.
**A1** Rejeição com motivo: pode voltar a submeter.
**E1** Documento ilegível → rejeitado com motivo específico.
**E2** Tentar levantar com `PENDING` → 403 (RN-051).

### UC-13 · Emitir documento fiscal
*Actor:* Sistema, para conta `BRAND` · *Pré:* `Deal` em `PAID`

**N** 1. Sistema emite `Invoice` com o número seguinte da série. 2. Calcula IVA sobre o valor da comissão e do serviço. 3. Gera PDF, guarda como `Media` `PROTECTED`. 4. Notifica a marca.
**E1** Conta sem NIF → a emissão fica pendente e a marca é notificada para completar os dados (RN-070).
**E2** Falha na geração do PDF: a factura existe e é numerada; o PDF é gerado de novo por tarefa, sem consumir novo número (RN-071).

### UC-14 · Gerir disponibilidade e vagas
*Actor:* Criador

**N** 1. Define janelas com vagas por oferta `BOOKING`. 2. Cada `Deal` criado consome uma vaga. 3. Esgotadas, o estado passa a `NO_SLOTS`.
**A1** Pausa o perfil: `PAUSED`, sem aceitar novos `Deal`; os que estão em curso seguem normalmente.
**A2** `Deal` recusado ou expirado: a vaga volta.
**E1** Janelas sobrepostas na mesma oferta → 422 (RN-033).
**E2** Dois compradores para a última vaga: a reserva acontece na transacção de criação com bloqueio; o segundo recebe 409 (RN-034).

### UC-15 · Avaliar
*Actor:* Comprador · *Pré:* `Deal` em `APPROVED` ou `PAID`

**N** 1. Dá nota de 1 a 5 e comentário. 2. Publica-se no perfil e a média é recalculada.
**A1** O criador responde uma vez.
**E1** Avaliar duas vezes o mesmo `Deal` → 409 (RN-046).
**E2** Avaliar `Deal` não concluído → 422 (RN-047).

---

## 7. Regras de negócio

Numeradas, e cada uma escrita para poder virar um teste directo.

### Perfil e conteúdo
| # | Regra |
|---|---|
| RN-010 | O `handle` é imutável 30 dias após a criação do perfil. |
| RN-011 | Publicar um perfil exige pelo menos uma `Offer` activa ou uma `Post` publicada. |
| RN-012 | `handle` é único, minúsculo, `[a-z0-9_]{3,30}` e não pertence à lista de reservados. |
| RN-020 | `Post` com `visibility = LOCKED` exige `priceMinor > 0`. |
| RN-021 | `Post` com `visibility = MEMBERS` exige uma `Offer` `MEMBERSHIP` activa no perfil. |
| RN-022 | Mudar a visibilidade de um `Post` nunca revoga `ContentGrant` já concedidos. |
| RN-023 | Comprar uma playlist concede acesso aos posts nela contidos no momento da compra; itens posteriores não são incluídos. |
| RN-024 | O acesso a conteúdo pago é decidido exclusivamente por `ContentGrant`. Nenhum caminho de leitura usa outro critério. |

### Ofertas e disponibilidade
| # | Regra |
|---|---|
| RN-030 | Toda a `Offer` tem `priceMinor ≥ 0` e `currency = 'AOA'`. |
| RN-031 | `slotsTaken ≤ slotsTotal` quando `slotsTotal` está definido. |
| RN-032 | Arquivar ou pausar uma oferta não altera `Deal` já criados, que mantêm o `offerSnapshot`. |
| RN-033 | Janelas de disponibilidade da mesma oferta não se sobrepõem no tempo. |
| RN-034 | A vaga é consumida na mesma transacção que cria o `Deal`, com bloqueio na janela. |

### Deal
| # | Regra |
|---|---|
| RN-040 | O comprador não pode ser o dono do perfil vendedor. |
| RN-041 | `offerSnapshot` é imutável; o preço do `Deal` é o do snapshot. **Única excepção:** T5 substitui o snapshot por uma versão nova, guardando a anterior no histórico da negociação. |
| RN-042 | `amountMinor = platformFeeMinor + creatorNetMinor`, em inteiros, sem resto perdido. `amountMinor` é o que o comprador paga, preço anunciado mais a sua metade da taxa. |
| RN-043 | `escrowStatus` só sai de `PENDING` com `PaymentIntent` em `CAPTURED`. Aceitar um `Deal` (T2) exige escrow em `HELD`. |
| RN-044 | O número de entregas rejeitadas não excede `revisionsIncluded`; esgotadas, o caminho é a disputa. |
| RN-045 | Ficheiros de entrega só ficam acessíveis ao comprador em `APPROVED`; antes disso, apenas pré-visualização com marca de água. |
| RN-046 | Uma avaliação por `Deal`, escrita pelo comprador. |
| RN-047 | Avaliar exige `Deal` em `APPROVED` ou `PAID`. |
| RN-048 | Disputa aberta bloqueia a libertação do escrow. |
| RN-049 | Toda a transição de estado escreve uma `Message` de tipo `STATE_CHANGE` na conversa do `Deal`. |

### Carteira e levantamentos
| # | Regra |
|---|---|
| RN-050 | Um levantamento exige saldo disponível suficiente, calculado a partir do razão. |
| RN-051 | Levantar exige `verificationLevel = IDENTITY`. |
| RN-052 | Pedir levantamento reserva o valor imediatamente. |
| RN-053 | Pedidos de levantamento concorrentes são serializados por bloqueio na conta do criador. |
| RN-054 | O valor mínimo de levantamento é configurável pela plataforma e validado no servidor. |

### Autorização
| # | Regra |
|---|---|
| RN-060 | Só quem é parte do `Deal` escreve nele. |
| RN-061 | Anexos de mensagem são `Media` `PROTECTED`. |
| RN-062 | Registos de verificação de identidade são legíveis apenas pelo próprio e pela administração. |
| RN-063 | Acesso a recurso de que o utilizador não é parte devolve 404, não 403, para não revelar existência. |
| RN-064 | O acesso de administração a uma conversa exige disputa aberta ou investigação registada, e fica no registo de auditoria. |
| RN-065 | Toda a decisão de autorização é tomada no servidor, a cada pedido. Nenhuma é delegada ao cliente. |

### Fiscal
| # | Regra |
|---|---|
| RN-070 | Conta `BRAND` exige NIF e designação social para receber factura. |
| RN-071 | A numeração de facturas é sequencial e sem lacunas dentro de cada série. |
| RN-072 | Uma factura emitida não é alterada; corrige-se por nota de crédito. |
| RN-073 | `grossMinor = netMinor + taxMinor`. |

### Media
| # | Regra |
|---|---|
| RN-080 | `storageKey` nunca é exposto ao cliente. |
| RN-081 | Media `PROTECTED` é servida apenas por URL assinada, com validade máxima de 15 minutos, emitida após verificação de acesso no servidor. |
| RN-082 | Nenhum objecto de conteúdo pago fica em armazenamento com leitura pública. |
| RN-083 | O nome original do ficheiro nunca faz parte do caminho de armazenamento. |

### Pagamentos e razão
| # | Regra |
|---|---|
| RN-090 | Toda a operação de pagamento leva `idempotencyKey`; repetir a chave devolve o resultado da primeira execução, sem novo efeito. |
| RN-091 | Cada notificação do parceiro é processada uma só vez, garantido por `providerEventId` único. |
| RN-092 | Um `Deal` tem no máximo um `PaymentIntent` activo. |
| RN-093 | `CAPTURED` é terminal; devolução é operação nova. |
| RN-094 | Valor capturado diferente do esperado não move escrow; marca para reconciliação e alerta. |
| RN-100 | A soma algébrica das entradas de cada `LedgerTransaction` é zero. |
| RN-101 | Entradas do razão não são alteradas nem apagadas; corrige-se por estorno. |
| RN-102 | `amountMinor > 0` em toda a entrada; o sinal está em `direction`. |
| RN-103 | `Wallet` é projecção do razão e é recalculável; divergência gera alerta. |
| RN-104 | Operações do razão são idempotentes por chave semântica, como `ledger:release:{dealId}`. A lista completa está em §11.4. |
| RN-105 | Um `Deal` em `PROPOSED` com escrow `HELD` tem na conta `ESCROW` exactamente `amountMinor`. Aceitar sem isto seria pôr o criador a trabalhar sobre um pagamento incompleto. |
| RN-110 | Repartir um valor devolve parcelas inteiras cuja soma é exactamente o valor original; o resto vai para a primeira parcela. |
| RN-111 | Nenhum valor monetário é representado em vírgula flutuante em qualquer camada, incluindo JSON — o transporte é `string` decimal de inteiro. |

---

## 8. Modelo de dados

### 8.1 Convenções físicas
PostgreSQL. Chaves `uuid`. Datas `timestamptz`. Dinheiro `bigint` + `char(3)`. Enumerados como `enum` nativo do Postgres, gerados pelo Prisma. Tudo em `snake_case` via `@@map`.

### 8.2 Tabelas

| Tabela | Chave | Colunas relevantes | Índices e restrições |
|---|---|---|---|
| `users` | `id` | `phone`, `email`, `display_name`, `roles[]`, `status`, `verification_level` | `UNIQUE(phone)`, `UNIQUE(email)` parcial `WHERE email IS NOT NULL` |
| `accounts` | `id` | `type`, `legal_name`, `tax_id`, `owner_user_id` | `UNIQUE(tax_id)` parcial; `CHECK(type <> 'BRAND' OR tax_id IS NOT NULL)` |
| `profiles` | `id` | `user_id`, `handle`, `availability_status`, `published_at` | `UNIQUE(user_id)`, `UNIQUE(lower(handle))`, `INDEX(availability_status, published_at)` |
| `posts` | `id` | `profile_id`, `kind`, `visibility`, `price_minor`, `published_at`, `deleted_at` | `INDEX(profile_id, published_at DESC)`; `CHECK(visibility <> 'LOCKED' OR price_minor > 0)` |
| `playlists` | `id` | `profile_id`, `visibility`, `price_minor` | `INDEX(profile_id)` |
| `playlist_items` | `id` | `playlist_id`, `post_id`, `position` | `UNIQUE(playlist_id, position)`, `UNIQUE(playlist_id, post_id)` |
| `media` | `id` | `owner_profile_id`, `storage_key`, `mime_type`, `status`, `visibility_scope`, `checksum_sha256` | `UNIQUE(storage_key)`, `INDEX(owner_profile_id, status)` |
| `video_renditions` | `id` | `media_id`, `width`, `height`, `bitrate_kbps`, `storage_key` | `UNIQUE(media_id, width, height)` |
| `offers` | `id` | `profile_id`, `kind`, `price_minor`, `sla_hours`, `revisions_included`, `slots_total`, `slots_taken`, `status` | `INDEX(profile_id, status)`; `CHECK(slots_total IS NULL OR slots_taken <= slots_total)`; `CHECK(price_minor >= 0)` |
| `availability_windows` | `id` | `profile_id`, `offer_id`, `starts_at`, `ends_at`, `slots_total`, `slots_taken` | `EXCLUDE USING gist (offer_id WITH =, tstzrange(starts_at, ends_at) WITH &&)` |
| **`deals`** | `id` | `reference`, `buyer_user_id`, `buyer_account_id`, `creator_profile_id`, `offer_id`, `offer_snapshot jsonb`, `status`, `escrow_status`, `amount_minor`, `platform_fee_minor`, `creator_net_minor`, `due_at`, `expires_at`, `last_message_at` | `UNIQUE(reference)`; `INDEX(creator_profile_id, status, created_at DESC)`; `INDEX(buyer_user_id, status)`; `INDEX(status, expires_at) WHERE status IN ('PROPOSED','ACCEPTED')`; `CHECK(amount_minor = platform_fee_minor + creator_net_minor)` |
| `messages` | `id` | `deal_id`, `sender_user_id`, `kind`, `body`, `read_at` | `INDEX(deal_id, created_at DESC)` |
| `direct_conversations` | `id` | `buyer_user_id`, `creator_profile_id`, `last_message_at` | `UNIQUE(buyer_user_id, creator_profile_id)`, índices de caixa por participante |
| `direct_messages` | `id` | `conversation_id`, `sender_user_id`, `body`, `client_id`, `read_at` | `UNIQUE(conversation_id, client_id)`, `INDEX(conversation_id, created_at)` |
| `message_attachments` | `id` | `message_id`, `media_id` | `INDEX(message_id)` |
| `deliveries` | `id` | `deal_id`, `version`, `note`, `submitted_at`, `accepted_at`, `rejected_at` | `UNIQUE(deal_id, version)` |
| `delivery_assets` | `id` | `delivery_id`, `media_id` | `INDEX(delivery_id)` |
| `payment_intents` | `id` | `deal_id`, `provider`, `provider_reference`, `amount_minor`, `status`, `idempotency_key`, `expires_at` | `UNIQUE(provider_reference)`, `UNIQUE(idempotency_key)`; índice único parcial `(deal_id) WHERE status IN ('CREATED','PENDING')` |
| `payment_events` | `id` | `payment_intent_id`, `provider_event_id`, `type`, `payload jsonb`, `received_at`, `processed_at` | `UNIQUE(provider_event_id)`, `INDEX(payment_intent_id, received_at)` |
| `ledger_transactions` | `id` | `kind`, `deal_id`, `payout_id`, `occurred_at`, `external_reference` | `UNIQUE(kind, external_reference)`, `INDEX(deal_id)` |
| `ledger_entries` | `id` | `transaction_id`, `account`, `subject_type`, `subject_id`, `direction`, `amount_minor` | `INDEX(account, subject_id, id)`; `CHECK(amount_minor > 0)`; sem `UPDATE`/`DELETE` por permissão de base de dados |
| `wallets` | `profile_id` | `available_minor`, `reserved_minor`, `pending_minor`, `recomputed_at` | projecção; reconstruída a partir de `ledger_entries` |
| `payouts` | `id` | `profile_id`, `amount_minor`, `fee_minor`, `net_minor`, `method`, `destination`, `status`, `provider_reference` | `INDEX(profile_id, status)`, `UNIQUE(provider_reference)` parcial |
| `invoices` | `id` | `number`, `series`, `account_id`, `deal_id`, `net_minor`, `tax_minor`, `gross_minor`, `tax_rate_bp`, `status` | `UNIQUE(series, number)`, `UNIQUE(deal_id)` parcial |
| `invoice_lines` | `id` | `invoice_id`, `description`, `quantity`, `unit_price_minor`, `tax_rate_bp` | `INDEX(invoice_id)` |
| `identity_verifications` | `id` | `user_id`, `document_type`, `document_number_encrypted`, `status`, `reviewer_user_id` | `INDEX(user_id, status)` |
| `content_grants` | `id` | `user_id`, `subject_type`, `subject_id`, `deal_id`, `expires_at` | `UNIQUE(user_id, subject_type, subject_id)`, `INDEX(user_id)` |
| `reviews` | `id` | `deal_id`, `author_user_id`, `profile_id`, `rating`, `body`, `reply` | `UNIQUE(deal_id)`, `INDEX(profile_id, published_at DESC)`; `CHECK(rating BETWEEN 1 AND 5)` |
| `disputes` | `id` | `deal_id`, `opened_by_user_id`, `reason`, `status`, `resolution`, `decided_by_user_id` | índice único parcial `(deal_id) WHERE status = 'OPEN'` |
| `audit_logs` | `id` | `actor_user_id`, `action`, `subject_type`, `subject_id`, `metadata jsonb`, `ip`, `created_at` | `INDEX(subject_type, subject_id, created_at DESC)`, `INDEX(actor_user_id, created_at DESC)` |
| `idempotency_keys` | `key` | `scope`, `request_hash`, `response_body jsonb`, `status`, `expires_at` | `UNIQUE(scope, key)`, `INDEX(expires_at)` |
| `outbox_events` | `id` | `type`, `payload jsonb`, `available_at`, `attempts`, `processed_at` | `INDEX(processed_at, available_at)` |

### 8.3 Decisões de modelação que merecem justificação

**`offer_snapshot` em JSON dentro de `deals`.** Duplicação deliberada. Sem ela, mudar o preço de uma oferta reescreveria a história de todos os `Deal` passados. O snapshot é o contrato.

**`wallets` como tabela, sendo projecção.** Existe por desempenho de leitura. A regra RN-103 impede que se torne a fonte de verdade: um trabalho recalcula e compara, e qualquer divergência é alerta.

**`ledger_entries` sem `UPDATE` nem `DELETE`.** Não é convenção, é permissão revogada ao papel da aplicação na base de dados. A imutabilidade é imposta pelo Postgres, não pela disciplina de quem escreve código.

**Índice único parcial em `payment_intents(deal_id)`.** É o que torna RN-092 verdadeiro sob concorrência. Duas tentativas simultâneas de pagar o mesmo `Deal`: uma passa, a outra recebe violação de unicidade, traduzida em `ResourceConflictError`.

**Restrição `EXCLUDE` nas janelas de disponibilidade.** RN-033 verificada pelo Postgres com `gist`. Verificação em aplicação perde a corrida sob concorrência.

### 8.4 Migrações previstas

A numeração real divergiu deste plano, porque `docs/plano.md` re-cortou as
fatias e a primeira passou a atravessar o ciclo inteiro. **O que está aplicado:**

| # | Nome | Fatia | Conteúdo |
|---|---|---|---|
| 001 | `identity_minimal` | F1 | `users`, `accounts`, enumerados de papel e estado |
| 002 | `profiles_offers` | F1 | `profiles` com `UNIQUE(lower(handle))`, `offers` |
| 003 | `deals_conversation` | F1 | `deals` com `CHECK(amount = fee + net)`, `messages`, `deliveries` |
| 004 | `payments` | F1 | `payment_intents`, `payment_events`, `idempotency_keys` |
| 005 | `ledger` | F1 | `ledger_transactions`, `ledger_entries`, `wallets` + revogação de `UPDATE`/`DELETE` |
| 006 | `ops` | F1 | `outbox_events`, `audit_logs`, com a mesma revogação |
| 007 | `message_ordering` | F1 | `messages.seq`, porque mensagens da mesma transacção partilham o `created_at` |
| 008 | `profile_settings` | F2 | bio, categoria, `published_at`, `availability_status` |
| 009 | `content_media` | F3 | `media`, `content_items`, `content_grants` |
| 010 | `reviews` | F6 | `reviews` com `UNIQUE(deal_id)` e `CHECK(rating BETWEEN 1 AND 5)` |
| 011 | `review_permissions` | F6 | `GRANT SELECT, INSERT` — uma avaliação não se reescreve |
| 012 | `deal_lifecycle` | F4 | `revision_count`, `closed_at`, índices parciais dos varrimentos de prazo |
| 013 | `counter_offers` | F4 | `deal_counter_offers` com único parcial por `Deal` pendente; `payment_intents.purpose` |
| 014 | `identity_verification` | F5 | `identity_verifications`, com único parcial por submissão à espera |
| 015 | `payouts` | F5 | `payouts` com `CHECK(amount = fee + net)` e índices de fila |
| 016 | `disputes` | F6 | `disputes` com único parcial por aberta e `CHECK` de decisão completa; resposta do criador na avaliação |
| 017 | `review_reply_grant` | F6 | a coluna `updated_at` que faltava ao `GRANT` por coluna da 016 |
| 018 | `availability` | F7 | extensão `btree_gist`, `availability_windows` com `EXCLUDE` de sobreposição; `deals.window_id` |
| 019 | `reconciliation` | F10 | `reconciliation_findings` com único parcial por divergência aberta; suspensão de conta com motivo |
| 020 | `notifications` | F9 | `notification_deliveries` com chave de idempotência única; `outbox_events.last_error` e índice parcial da fila |
| 021 | `content_unlock` | F3 | `offers.content_item_id` com único parcial e `CHECK`: a oferta que desbloqueia uma publicação paga |
| 022 | `direct_messages` | F11 | DM gratuita separada de pedidos, com conversa única por par e envio idempotente |

**Por aplicar**, com a fatia que as traz: `invoices` (F8).

Regra: uma migração por fatia vertical; sem alterações destrutivas em coluna com dados sem fase de escrita dupla.

---

## 9. Contratos de API

Base `/api`. JSON. Erros com a forma já produzida por `DomainExceptionFilter` e `ZodValidationPipe`:

```jsonc
// validação (400)
{ "statusCode": 400, "error": "ValidationError", "message": "Request payload failed validation",
  "issues": [{ "path": "brief", "message": "String must contain at least 10 character(s)" }] }

// domínio (404 / 409 / 422)
{ "statusCode": 422, "error": "BusinessRuleError", "message": "Deal is not in a state that accepts delivery" }
```

**Dinheiro no transporte:** `{ "amount": "1500000", "currency": "AOA" }` — string de inteiro em cêntimos (RN-111). Nunca número JSON, que é IEEE-754 e não representa `bigint` com segurança.

**Paginação:** cursor. `?cursor=<opaco>&limit=20`, resposta `{ data: [...], nextCursor: string | null }`.

Legenda de acesso: 🌐 público · 🔑 autenticado · 👤 dono do recurso · 🤝 parte do `Deal` · 🛡️ admin

### 9.1 Perfis e descoberta

| Método | Rota | Entrada | Saída | Acesso | Erros |
|---|---|---|---|---|---|
| `GET` | `/profiles/:handle` | — | perfil, ofertas activas, disponibilidade, média de avaliações | 🌐 | 404 |
| `GET` | `/profiles/:handle/posts` | cursor | lista; corpo completo só com `ContentGrant`, resto com pré-visualização e preço | 🌐 | 404 |
| `GET` | `/profiles/:handle/playlists` | cursor | lista | 🌐 | 404 |
| `GET` | `/profiles/:handle/reviews` | cursor | lista | 🌐 | 404 |
| `POST` | `/profiles` | `handle`, `displayName`, `bio`, `category` | perfil | 🔑 | 409 handle ocupado, 422 já tem perfil |
| `PATCH` | `/profiles/me` | campos parciais | perfil | 👤 | 422 handle imutável (RN-010) |
| `POST` | `/profiles/me/publish` | — | perfil | 👤 | 422 sem oferta nem publicação (RN-011) |
| `PATCH` | `/profiles/me/availability` | `status` | perfil | 👤 | 422 estado inválido |

### 9.2 Conteúdo

**Implementado com uma forma diferente da desenhada.** Em vez de `posts` e
`playlists` como recursos separados, há um `ContentItem` com `kind ∈ {PHOTO,
VIDEO, ALBUM, PLAYLIST}` — um álbum e uma playlist são o mesmo com uma lista de
media, e separá-los duplicava o controlo de acesso. As rotas do catálogo vivem
em `/profiles/**`, como as ofertas: o caminho diz de quem é sem ser preciso ler
o guarda.

| Método | Rota | Entrada | Saída | Acesso | Erros |
|---|---|---|---|---|---|
| `POST` | `/media` | `mimeType`, `base64` | `{ id, mimeType, url }` assinada | 🔑 | 422 bytes não correspondem ao tipo |
| `GET` | `/media/:id?token=` | — | o ficheiro | 🌐 quem tem a assinatura | 404 token inválido, expirado ou de outro ficheiro |
| `POST` | `/profiles/me/content` | `kind`, `caption`, `visibility`, `priceMinor`, `mediaIds`, `status` | publicação | 👤 criador | 422 RN-020/021 |
| `GET` | `/profiles/me/content` | — | o catálogo do próprio, rascunhos incluídos | 👤 criador | 404 sem perfil |
| `GET` | `/profiles/:handle/content` | — | o catálogo público, mais o que o visitante comprou | 🌐 ou 🔑 | 404 perfil por publicar |
| `GET` | `/profiles/:handle/content/:id` | — | a publicação; media completa só com acesso | 🌐 ou 🔑 | 404 |

**`unlockOfferId`** vem na publicação bloqueada e paga: é a oferta
`CONTENT_UNLOCK` que a desbloqueia, e é o que o comprador contrata. Vem `null`
para quem já tem acesso — não se oferece comprar o que já é seu.

**Por implementar:** apagar uma publicação (`deletedAt` existe no modelo e não há
rota), e reordenar itens de uma playlist depois de criada (RN-023).

### 9.3 Media

| Método | Rota | Entrada | Saída | Acesso | Erros |
|---|---|---|---|---|---|
| `POST` | `/media/uploads` | `mimeType`, `sizeBytes`, `scope` | `{ mediaId, uploadUrl, expiresIn }` | 🔑 | 422 tipo ou tamanho não aceites |
| `POST` | `/media/:id/complete` | `checksumSha256` | media | 👤 dono | 409 checksum divergente |
| `GET` | `/media/:id/url` | — | `{ url, expiresAt }` URL assinada, ≤ 15 min | 👤 ou 🤝 ou grant | **404 sem acesso** (RN-063) |

### 9.4 Ofertas e disponibilidade

| Método | Rota | Entrada | Saída | Acesso | Erros |
|---|---|---|---|---|---|
| `POST` | `/offers` | `kind`, `title`, `price`, `slaHours`, `revisionsIncluded`, `slotsTotal` | oferta | 👤 criador | 422 RN-030 |
| `PATCH` | `/offers/:id` | parcial | oferta | 👤 dono | 404, 422 |
| `POST` | `/offers/:id/archive` | — | oferta | 👤 dono | 404 |
| `GET` | `/offers/:id/availability` | `from`, `to` | janelas com vagas livres | 🌐 | 404 |
| `POST` | `/offers/:id/availability` | `startsAt`, `endsAt`, `slotsTotal` | janela | 👤 dono | 422 sobreposição (RN-033) |

### 9.5 Deals — o núcleo

| Método | Rota | Entrada | Saída | Acesso | Erros |
|---|---|---|---|---|---|
| `POST` | `/deals` | `offerId`, `brief`, `accountId?`, `availabilityWindowId?` | deal | 🔑 | 409 sem vagas, 422 RN-040/032 |
| `GET` | `/deals` | `role=buyer\|creator`, `status`, cursor | lista | 🔑, filtrada pelo utilizador | — |
| `GET` | `/deals/:id` | — | deal completo com estado, valores, últimas mensagens | 🤝 | **404 se não é parte** |
| `POST` | `/deals/:id/accept` | — | deal | 👤 criador | 403, 422 por pagar ou estado |
| `POST` | `/deals/:id/decline` | `reason?` | deal | 👤 criador | 403, 422 estado |
| `POST` | `/deals/:id/counter-offers` | `priceMinor`, `slaHours`, `message?` | deal + contraproposta | 👤 criador | 422 termos iguais, 409 já existe |
| `POST` | `/deals/:id/counter-offers/accept` | — | deal + `outcome` + `topUp` | 👤 comprador | 409 sem contraproposta |
| `POST` | `/deals/:id/counter-offers/decline` | — | deal | 👤 comprador | 409 sem contraproposta |
| `POST` | `/deals/:id/counter-offers/top-up` | `payerPhone`, cabeçalho `Idempotency-Key` | intenção de pagamento | 👤 comprador | 409 sem reforço a fazer |
| `POST` | `/deals/:id/refund` | — | deal | 👤 comprador | 422 ainda dentro do prazo |
| `POST` | `/availability` | `offerId`, `startsAt`, `endsAt`, `slotsTotal` | janela | 👤 criador | 422 RN-033, 404 oferta alheia |
| `GET` | `/availability` | — | a agenda do próprio | 👤 criador | 404 sem perfil |
| `DELETE` | `/availability/:id` | — | 204 | 👤 dono | 409 já reservada, 404 alheia |
| `GET` | `/offers/:offerId/availability` | — | vagas por acontecer | 🌐 pública | — |
| `POST` | `/deals/:id/deliveries` | `note`, `mediaIds` | entrega | 👤 criador | 422 estado, 422 revisões esgotadas |
| `POST` | `/deals/:id/deliveries/:v/approve` | — | deal | 👤 comprador | 422 |
| `POST` | `/deals/:id/deliveries/:v/reject` | `reason` | deal | 👤 comprador | 422 RN-044 |
| `GET` | `/deals/:id/messages` | cursor | mensagens | 🤝 | 404 |
| `POST` | `/deals/:id/messages` | `body`, `mediaIds?`, `clientId` | mensagem | 🤝 | 404, 422 conversa fechada |
| `POST` | `/deals/:id/messages/read` | `upToMessageId` | 204 | 🤝 | 404 |
| `POST` | `/deals/:id/disputes` | `reason` | deal + disputa | 🤝 qualquer das partes | 409 já aberta, 422 estado |
| `POST` | `/deals/:id/disputes/withdraw` | — | disputa | 👤 quem a abriu | 409 sem disputa aberta |
| `POST` | `/deals/:id/review/reply` | `reply` | avaliação | 👤 criador avaliado | 403, 422 já respondida |
| `POST` | `/deals/:id/review` | `rating`, `body` | avaliação | 👤 comprador | 409 já avaliado, 422 RN-047 |

`clientId` na criação de mensagem é a chave de idempotência do lado do cliente: reenviar a mesma devolve a mensagem já criada, o que resolve o duplo envio em rede instável.

### 9.5b DM gratuita

| Método | Rota | Entrada | Saída | Acesso | Erros |
|---|---|---|---|---|---|
| `GET` | `/profiles/:handle/direct-messages` | — | conversa do par ou estado vazio | 🔑 comprador | 403 consigo próprio, 404 perfil |
| `POST` | `/profiles/:handle/direct-messages` | `body`, `clientId` | conversa actualizada | 🔑 comprador | 422 limite semanal |
| `GET` | `/direct-conversations` | — | caixa de DMs do utilizador | 🔑 participante | — |
| `GET` | `/direct-conversations/:id` | — | conversa | 🤝 | 404 sem acesso |
| `POST` | `/direct-conversations/:id/messages` | `body`, `clientId` | conversa actualizada | 🤝 | 404 sem acesso, 422 limite do comprador |

O limite de uma mensagem grátis a cada sete dias aplica-se apenas ao comprador;
as respostas do criador não o consomem. `clientId` é único dentro da conversa.

`/counter-offers/accept` devolve `outcome`: `settled` quando o acordo mudou e o
escrow já vale o valor novo, ou `top_up_required` com quanto falta reforçar. No
segundo caso **nada transitou** — quem faz T5 acontecer é a captura do reforço.

**Não existe rota que liberte escrow.** `/refund` devolve-o, e mesmo essa move o
dinheiro por consequência da transição, não por acção directa.

### 9.6 Pagamentos

| Método | Rota | Entrada | Saída | Acesso | Erros |
|---|---|---|---|---|---|
| `POST` | `/deals/:id/payments` | `payerPhone`, cabeçalho `Idempotency-Key` | `{ intentId, status, expiresAt, instructions }` | 👤 comprador | 409 intenção activa, 422 estado |
| `GET` | `/deals/:id/payments/:intentId` | — | estado da intenção | 👤 comprador | 404 |
| `POST` | `/webhooks/payments/:provider` | corpo assinado pelo parceiro | 200 sempre que a assinatura é válida | assinatura HMAC | 401 assinatura inválida |

O webhook responde 200 mesmo para evento já processado — o parceiro não deve reentregar. Falha de processamento interno responde 500 para provocar reentrega.

### 9.7 Carteira e levantamentos

| Método | Rota | Entrada | Saída | Acesso | Erros |
|---|---|---|---|---|---|
| `GET` | `/wallet` | — | `{ available, reserved, pending, currency }` | 👤 criador | 403 |
| `GET` | `/wallet/entries` | cursor, `from`, `to` | movimentos do razão do próprio criador | 👤 criador | 403 |
| `POST` | `/payouts` | `amount`, `method`, `destination`, `Idempotency-Key` | payout | 👤 criador verificado | 403 RN-051, 422 RN-050 |
| `GET` | `/payouts` | cursor | lista própria | 👤 criador | 403 |
| `POST` | `/payouts/:id/cancel` | — | payout | 👤 dono, estado `REQUESTED` | 422 |

### 9.8 Identidade, facturas, administração

| Método | Rota | Acesso | Notas |
|---|---|---|---|
| `POST` | `/identity-verifications` | 🔑 | documento e selfie como `Media` `PROTECTED` |
| `GET` | `/identity-verifications/me` | 👤 | RN-062 |
| `GET` | `/invoices` | 👤 conta | lista da própria conta |
| `GET` | `/invoices/:id/pdf` | 👤 conta | URL assinada |
| `GET` | `/admin/disputes` | 🛡️ | fila de disputas |
| `POST` | `/admin/disputes/:id/resolve` | 🛡️ | `resolution ∈ {BUYER, CREATOR}`, `note?`; a favor do comprador dispara T15 e E3 |
| `GET` | `/admin/disputes/deals/:dealId/conversation` | 🛡️ | só com disputa aberta; **cada leitura fica na auditoria** (RN-064) |
| `POST` | `/admin/disputes/deals/:dealId/messages` | 🛡️ | mensagem `SYSTEM`, sem autor pessoal |
| `POST` | `/admin/identity-verifications/:id/review` | 🛡️ | aprova ou rejeita com motivo |
| `GET` | `/admin/reconciliation` | 🛡️ | divergências abertas, críticas primeiro |
| `POST` | `/admin/reconciliation/run` | 🛡️ | corre a tarefa agora; cruza e regista, **não corrige** |
| `POST` | `/admin/reconciliation/:id/close` | 🛡️ | `outcome ∈ {RESOLVED, ACCEPTED}` e `note` obrigatória |
| `GET` | `/admin/audit` | 🛡️ | por recurso, actor ou acção |
| `GET` | `/admin/metrics` | 🛡️ | negócio, dinheiro, integridade e filas |
| `POST` | `/admin/users/:id/suspend` | 🛡️ | com motivo, escreve auditoria; efeito imediato |
| `POST` | `/admin/users/:id/reinstate` | 🛡️ | com justificação, escreve auditoria |

---

## 10. Autorização

### 10.1 Princípio

A pergunta que autoriza quase tudo é *qual é a relação deste utilizador com este recurso?*, não *que papel tem?*. A relação é apurada no servidor, a cada pedido, consultando a base de dados (RN-065). Nada é decidido por reivindicação vinda do cliente ou por campo escondido na interface.

### 10.2 Mecanismo

Um guarda global exige autenticação, e um decorador `@Public()` marca as excepções. Sobre isso, guardas de relação:

| Guarda | Pergunta | Aplica-se a |
|---|---|---|
| `ProfileOwnerGuard` | `profile.userId === auth.userId` | tudo sob `/profiles/me`, `/posts`, `/offers` |
| `DealParticipantGuard` | `deal.buyerUserId === auth.userId` ou `deal.creatorProfile.userId === auth.userId` | tudo sob `/deals/:id` |
| `DealBuyerGuard` | é o comprador | pagar, aprovar, rejeitar, avaliar |
| `DealCreatorGuard` | é o criador | aceitar, recusar, contrapor, entregar |
| `ContentAccessGuard` | existe `ContentGrant` válido, ou o post é público, ou é o autor | leitura de post e media |
| `VerifiedIdentityGuard` | `verificationLevel = IDENTITY` | levantamentos |
| `AdminGuard` | papel `ADMIN`, com auditoria | `/admin/**` |

**Regra de resposta:** falhar um guarda de relação devolve **404**, não 403 (RN-063). Um 403 confirma que o recurso existe, e isso já é informação a mais sobre um `Deal` alheio. O 403 fica reservado para os casos em que a existência não é segredo — falta de verificação de identidade, conta suspensa.

### 10.3 Regra de acesso por recurso

| Recurso | Ler | Escrever |
|---|---|---|
| `Profile` publicado | Todos | Só o dono |
| `Profile` não publicado | Só o dono | Só o dono |
| `Post` `PUBLIC` | Todos | Autor |
| `Post` `LOCKED` | Autor, ou quem tem `ContentGrant`; os restantes vêem metadados e pré-visualização | Autor |
| `Post` `MEMBERS` | Autor, ou membro com grant válido | Autor |
| `Media` `PUBLIC_ASSET` | Todos | Dono |
| `Media` `PROTECTED` | Quem tem acesso ao recurso que a contém, por URL assinada | Dono |
| `Offer` | Todos, se `ACTIVE` | Dono do perfil |
| `Deal` | Só as duas partes; admin com disputa aberta | Só as partes, e só as transições que lhe cabem |
| `Message` | Só as partes do `Deal` | Só as partes |
| `Delivery` | Ambas as partes; ficheiros só ao comprador em `APPROVED` | Só o criador |
| `PaymentIntent` | Comprador e admin | Só o sistema |
| `LedgerEntry` | Criador vê as suas; admin vê tudo | Ninguém escreve por API |
| `Wallet` | Só o dono | Ninguém escreve directamente |
| `Payout` | Só o dono e admin | Dono cria e cancela; admin aprova |
| `Invoice` | Só a conta destinatária e admin | Só o sistema |
| `IdentityVerification` | Só o próprio e admin | Próprio cria; admin decide |
| `Review` | Todos | Comprador escreve uma vez; criador responde uma vez |
| `AuditLog` | Só admin | Só o sistema |

### 10.4 O que nunca acontece

Nenhum pedido, conversa, ficheiro ou movimento de carteira é acessível a quem não é parte dele. Não há rota que aceite um identificador de utilizador vindo do corpo do pedido para decidir de quem são os dados. Não há filtragem feita apenas no cliente. Não há URL de conteúdo pago que funcione sem verificação prévia no servidor.

---

## 11. Pagamentos

### 11.1 Interface

O parceiro ainda não está fechado. Toda a integração fica atrás de uma porta, com duas implementações escolhidas por `PAYMENTS_PROVIDER`:

```ts
interface PaymentsGateway {
  createIntent(input: {
    dealReference: string;
    amount: Money;
    payerPhone: PhoneNumber;
    idempotencyKey: string;
  }): Promise<{ providerReference: string; status: IntentStatus; expiresAt: Date }>;

  getIntent(providerReference: string): Promise<{ status: IntentStatus; capturedAmount?: Money }>;

  refund(input: {
    providerReference: string;
    amount: Money;
    idempotencyKey: string;
  }): Promise<{ refundReference: string; status: RefundStatus }>;

  verifyWebhookSignature(rawBody: Buffer, headers: Record<string, string>): boolean;
  parseWebhookEvent(rawBody: Buffer): ProviderEvent;
}
```

`FakePaymentsGateway` é a implementação de desenvolvimento e teste: captura imediata, captura atrasada, recusa, expiração e notificação duplicada, todas provocáveis por um comando ou por um sufixo no número de telefone de teste. É ela que corre nos testes de caso de uso e no ambiente local — nenhum teste depende de rede.

### 11.2 Retenção

O dinheiro do comprador é capturado no início e fica retido pela plataforma até o trabalho ser aprovado. `escrowStatus` no `Deal` é o estado; o razão é o registo. A plataforma não é banco: o valor retido está numa conta de liquidação do parceiro e a conta `ESCROW` do razão representa a obrigação da plataforma perante o `Deal`.

### 11.3 Libertação e devolução

Libertar (E2) e devolver (E3) são as únicas saídas de `HELD`. Ambas correm dentro de uma transacção de base de dados que escreve `LedgerTransaction` e as suas entradas, actualiza `Deal` e enfileira o evento de notificação em `outbox_events`. Ou tudo, ou nada.

**A comissão é de 5% de cada lado (DP-07).** O comprador paga o preço anunciado
mais 5%; o criador recebe o preço anunciado menos 5%. Numa oferta de 50 000,00
Kz, o comprador paga 52 500,00, o criador recebe 47 500,00 e a plataforma fica
com 5 000,00 — 10% do preço anunciado, metade de cada lado.

`Deal.amountMinor` é **o que o comprador paga**, não o preço anunciado. RN-042
sobrevive sem alteração:

```
platformFee + creatorNet = (taxaComprador + taxaCriador) + (preço − taxaCriador)
                         = preço + taxaComprador
                         = amount
```

A repartição usa `Money.allocate` e segue RN-110, sem cêntimo perdido.

### 11.4 Idempotência

Três camadas, porque falham de maneiras diferentes:

1. **Cabeçalho `Idempotency-Key`** em toda a rota que move dinheiro. A tabela `idempotency_keys` guarda a resposta da primeira execução e devolve-a às repetições; corpo diferente com a mesma chave é 409.
2. **`providerEventId` único** em `payment_events`. A mesma notificação chega duas vezes: a segunda viola a unicidade, é ignorada, responde 200 (RN-091).
3. **Chave semântica no razão**, em `UNIQUE(kind, external_reference)`. Se a operação for tentada duas vezes por retentativa de tarefa, a segunda não duplica lançamentos (RN-104). As chaves em uso:

   | Operação | Chave |
   |---|---|
   | Captura do pagamento (E1) | `ledger:capture:{dealId}` |
   | Libertação do escrow (E2) | `ledger:release:{dealId}` |
   | Estorno total (E3) | `ledger:refund:{dealId}` |
   | Reforço da contraproposta | `ledger:top-up:{counterOfferId}` |
   | Estorno parcial da contraproposta | `ledger:counter-refund:{counterOfferId}` |

   As duas últimas são por contraproposta e não por `Deal`: um pedido pode ser renegociado mais do que uma vez, e cada acerto é dinheiro novo.

### 11.5 Reconciliação

Tarefa diária que compara, por período:

- intenções em `PENDING` há mais de uma hora contra o estado real no parceiro;
- capturas registadas no razão contra o extracto do parceiro;
- saldo do razão por conta contra a projecção `Wallet`;
- levantamentos em `PROCESSING` há mais de 48 h.

Toda a divergência gera um registo em `reconciliation_findings` e alerta. Nenhuma correcção é automática: divergência de dinheiro é decidida por pessoa, com registo de auditoria.

**Implementado com seis cruzamentos, não quatro.** Aos dois que dependem do
parceiro — intenções e capturas contra o extracto — juntaram-se dois que o
sistema pode verificar sobre si próprio: transacções do razão que não somam zero
(RN-100 em verificação contínua) e escrow retido em `Deal` já fechado. Os que
dependem do parceiro verificam hoje o sistema contra si próprio, e só ficam
completos com DP-04.

A mesma divergência não se regista a cada passagem: a impressão digital é
`kind:subjectId`, com índice único parcial enquanto a divergência estiver
aberta. Fechar exige dizer o que se fez, e distingue **resolvida** de
**aceite** — a segunda é um sinal sobre o sistema, não sobre aquele dia.

### 11.6 Registo contabilístico

Contas do razão:

| Conta | Natureza | Significa |
|---|---|---|
| `PROVIDER_CLEARING` | Activo | A receber do parceiro de pagamentos |
| `ESCROW` | Passivo | Retido por conta de `Deal` em curso |
| `CREATOR_AVAILABLE` | Passivo | Devido ao criador, levantável |
| `CREATOR_RESERVED` | Passivo | Devido ao criador, com levantamento em curso |
| `PLATFORM_FEE_REVENUE` | Proveito | Comissão reconhecida |
| `REFUNDS_PAYABLE` | Passivo | A devolver ao comprador |
| `TAX_PAYABLE` | Passivo | Imposto retido a entregar |

Exemplo completo de uma oferta anunciada a **50 000,00 Kz**, com 5% de cada lado
(DP-07). O comprador paga 52 500,00; o criador recebe 47 500,00.

```
Captura        DÉBITO  PROVIDER_CLEARING      5 250 000
               CRÉDITO ESCROW                            5 250 000

Libertação     DÉBITO  ESCROW                 5 250 000
               CRÉDITO CREATOR_AVAILABLE                 5 000 000
               DÉBITO  CREATOR_AVAILABLE        250 000
               CRÉDITO PLATFORM_FEE_REVENUE                500 000

Levantamento   DÉBITO  CREATOR_AVAILABLE      4 750 000
               CRÉDITO CREATOR_RESERVED                  4 750 000

Confirmado     DÉBITO  CREATOR_RESERVED       4 750 000
               CRÉDITO PROVIDER_CLEARING                 4 750 000
```

**São quatro entradas na libertação, não três.** O criador é creditado pelo
**preço anunciado** e debitado pela sua metade da taxa, em linhas separadas,
porque é assim que a carteira do design mostra os movimentos: a entrada e a taxa
lêem-se cada uma por si. O líquido é exactamente o mesmo, e a transacção
continua a somar zero. Entradas de valor zero são omitidas — o razão só aceita
valores positivos (RN-102), e uma taxa de 0% não deve inventar uma linha vazia.

Quando o negócio não chega a bom porto, o dinheiro sai por outro lado:

```
Estorno        DÉBITO  ESCROW                 5 250 000
               CRÉDITO REFUNDS_PAYABLE                   5 250 000
```

E quando uma contraproposta acerta o valor — aqui, de 50 000,00 para 60 000,00,
com o comprador a reforçar 10 500,00:

```
Reforço        DÉBITO  PROVIDER_CLEARING      1 050 000
               CRÉDITO ESCROW                            1 050 000
```

Cada bloco soma zero (RN-100). Os valores estão em cêntimos de Kwanza.

---

## 12. Media

### 12.1 Carregamento

Carregamento directo do cliente para o armazenamento, com URL assinada de curta duração emitida pela API. O ficheiro nunca passa pelo processo Node — protege memória e latência.

1. `POST /media/uploads` valida tipo e tamanho contra a lista permitida, cria `Media` em `UPLOADING` com `storageKey` gerado por UUID, devolve URL de escrita válida 10 minutos.
2. O cliente envia o ficheiro para essa URL.
3. `POST /media/:id/complete` confere o checksum, passa a `SCANNING`.
4. Tarefa assíncrona: verificação de tipo real por conteúdo e não por extensão, análise de conteúdo impróprio, geração de miniatura e, para vídeo, derivações. Termina em `READY` ou `REJECTED`.

Limites: imagem 15 MB, áudio 50 MB, vídeo 2 GB, documento 25 MB. Tipos permitidos por lista explícita; tudo o resto é recusado.

### 12.2 Armazenamento

Dois escopos, dois comportamentos:

| Escopo | Bucket | Acesso |
|---|---|---|
| `PUBLIC_ASSET` | público, com CDN | avatares, capas, miniaturas de conteúdo público |
| `PROTECTED` | privado, sem leitura anónima | conteúdo pago, anexos de conversa, entregas, documentos de identidade |

O `storageKey` é um UUID sem relação com o nome original, o perfil ou o `Deal` (RN-083). Mesmo que vazasse, não se adivinha o vizinho, e não serve de nada sem assinatura.

### 12.3 Acesso a conteúdo pago

O acesso é sempre uma pergunta feita ao servidor:

```
GET /media/:id/url
  → o guarda resolve o dono e o contexto da media
  → verifica ContentGrant, participação no Deal, ou propriedade
  → sem direito: 404
  → com direito: URL assinada, validade ≤ 15 min, ligada ao utilizador e registada
```

Nenhuma URL assinada é guardada em cache partilhada nem colocada em HTML servido a mais do que um utilizador. Pré-visualização de conteúdo bloqueado é uma derivação separada, desfocada e de baixa resolução, gerada no carregamento e guardada como asset próprio — nunca o original com um filtro aplicado no cliente.

### 12.4 Entregas

Os ficheiros de entrega ficam `PROTECTED` e, antes de `APPROVED`, o comprador só recebe a versão com marca de água (RN-045). A marca de água é gerada no momento da submissão, não a pedido, para que o original nunca seja lido por um caminho acessível ao comprador.

---

## 13. Mensagens e tempo real

### 13.1 Modelo

A conversa não é um módulo autónomo: é a lista de `Message` de um `Deal`. Isso simplifica a autorização até ao ponto de a tornar uma linha, e garante que nenhuma conversa existe sem contexto comercial.

Tipos de mensagem: `TEXT` de uma das partes, `ATTACHMENT` com media protegida, `SYSTEM` da administração em disputa, e `STATE_CHANGE` escrita pelo sistema a cada transição (RN-049). Lida de cima a baixo, a conversa é o historial completo do negócio.

### 13.2 Entrega em tempo real

O contrato:

- canal por `Deal`, com subscrição autorizada pelo mesmo `DealParticipantGuard` das rotas;
- eventos `message.created`, `deal.state_changed`, `delivery.submitted`, `payment.captured`;
- cada evento leva o `id` e a versão do `Deal`; o cliente que perde ligação recupera por `GET /deals/:id/messages?cursor=`, sem depender do canal para consistência;
- o canal é optimização de latência, nunca fonte de verdade.

**A tecnologia de transporte é decisão pendente DP-02** — não há pacote de WebSocket instalado no repositório. O contrato acima é independente do transporte escolhido.

### 13.3 Ordenação e duplicados

Ordem por `(createdAt, id)`. O cliente envia `clientId` e o servidor devolve-o, o que permite reconciliar a mensagem optimista com a persistida e travar o duplo envio.

---

## 14. Notificações

### 14.1 Interface e canais

```ts
interface NotificationChannel {
  readonly kind: 'PUSH' | 'SMS' | 'EMAIL';
  send(input: { to: Recipient; template: TemplateId; data: Record<string, unknown>; idempotencyKey: string }): Promise<DeliveryReceipt>;
}
```

Como nos pagamentos, cada canal tem implementação real e falsa. Em desenvolvimento e teste, a falsa grava numa lista inspeccionável — os testes verificam que a notificação certa foi enfileirada, sem rede.

**Os fornecedores concretos de push, SMS e e-mail são decisão pendente DP-03.**

**Implementado com só a implementação falsa.** O despacho, a matriz, as regras
de §14.3 e a idempotência não dependem de DP-03, e estão feitos — o que falta é
por onde sai. `NOTIFICATIONS_PROVIDER=real` faz o arranque falhar com a
mensagem a dizer porquê, da mesma maneira que `PAYMENTS_PROVIDER`.

### 14.2 Matriz de eventos

| Evento | Comprador | Criador | Canal preferido |
|---|---|---|---|
| `Deal` criado | confirmação | **aviso** | push, SMS se ausente 15 min |
| Aceite, com pedido de pagamento | **aviso** | — | push + SMS |
| Pagamento capturado | recibo | **aviso** | push |
| Entrega submetida | **aviso** | — | push + e-mail |
| Aprovação automática em 24 h | **lembrete** | — | push |
| Dinheiro libertado | — | **aviso** | push |
| Disputa aberta | ambos | ambos | push + e-mail |
| Levantamento pago | — | **aviso** | push + SMS |
| Factura emitida | marca | — | e-mail com anexo |

### 14.3 Regras de envio

O envio parte de `outbox_events`, escrito na mesma transacção que muda o estado. Um trabalhador consome, envia e marca. Isto evita o caso em que a transacção reverte mas a notificação já saiu — e há teste que o prova, nos dois níveis.

**A gravação da entrega vem antes do envio.** Entre gravar e enviar pode falhar
tudo, e o pior que acontece é uma notificação perdida; pela ordem contrária, o
pior seria a mesma notificação duas vezes. Perder é recuperável por quem abre a
aplicação; duplicar não se desfaz.

**O silêncio é adiar, não descartar**: o que chega às 23h sai às 7h da manhã
seguinte. Luanda é UTC+1 o ano inteiro, o que dispensa biblioteca de fusos.

SMS custa dinheiro e interrompe: só para pagamento pendente, aceitação e levantamento pago. Agrupamento de mensagens de conversa em janela de 5 minutos. Silêncio entre as 22h e as 7h, hora de Luanda, excepto pagamento e disputa. Cada envio leva `idempotencyKey` derivada de `(evento, destinatário)`.

---

## 15. Observabilidade e auditoria

### 15.1 Registo estruturado

JSON por linha, com `requestId`, `userId`, `dealId` quando existe, rota, estado e duração. **Nunca** em registo: número de telefone completo, documento de identidade, destino de levantamento, token, assinatura de webhook, conteúdo de mensagem. Números de telefone aparecem mascarados, `+2449****321`.

### 15.2 Métricas

| Categoria | Métricas |
|---|---|
| Negócio | `Deal` criados, taxa de aceitação, taxa de pagamento após aceitação, tempo até entrega contra SLA, taxa de disputa |
| Dinheiro | valor retido, valor libertado, valor devolvido, divergências de reconciliação abertas |
| Técnica | latência por rota, taxa de erro 4xx/5xx, tempo de resposta do parceiro, tamanho da fila de outbox, atraso da fila |
| Integridade | divergência entre razão e `Wallet`, eventos de webhook por processar, intenções presas em `PENDING` |

### 15.3 Auditoria

`audit_logs` regista actor, acção, recurso, dados antes e depois quando aplicável, endereço e momento. Escrevem auditoria, obrigatoriamente: toda a transição de `Deal`, toda a operação do razão, todo o acesso de administração a conversa ou a dados de identidade, toda a decisão de disputa, toda a suspensão de conta, toda a emissão e anulação de factura.

O registo de auditoria é imutável, com a mesma revogação de `UPDATE` e `DELETE` aplicada ao razão. Retenção mínima de sete anos para o que toca em dinheiro e em documento fiscal.

### 15.4 Alertas

Divergência de reconciliação superior a zero, webhooks por processar há mais de 15 minutos, taxa de falha de pagamento acima do dobro da mediana semanal, qualquer `403`/`404` repetido sobre recursos alheios pelo mesmo utilizador (sinal de sondagem), e falha de transacção do razão.

---

## 16. Estratégia de testes

Vitest 2.1.9 nas duas apps, testes ao lado do código, `*.spec.ts`.

### 16.1 O que se testa e como

| Nível | Alvo | Dependências | Onde |
|---|---|---|---|
| Domínio | invariantes, transições, aritmética de dinheiro | nenhuma | `domain/*.spec.ts` |
| **Caso de uso** | **um ficheiro por caso de uso, obrigatório** | repositórios e gateways em memória | `application/use-cases/*.spec.ts` |
| Integração | repositórios Prisma, restrições, concorrência | Postgres real, por esquema isolado | `infra/**/*.spec.ts` |
| HTTP | validação Zod, guardas, códigos de erro | supertest sobre módulo com falsos | `http/*.spec.ts` |
| Web | componentes e ecrãs | Testing Library + jsdom | `apps/web/src/**/*.spec.tsx` |

**Todos os casos de uso são testados.** É requisito, não meta de cobertura.

### 16.2 O que um teste de caso de uso deve provar

Um teste que apenas verifica que um método foi chamado não prova nada. Cada caso de uso é testado pelo que acontece de facto:

- **caminho normal** — o estado resultante, os valores calculados, os eventos enfileirados;
- **cada caminho de erro declarado no capítulo 6** — a classe de erro certa, não só que lançou;
- **os invariantes que lhe cabem** — por exemplo, `ApproveDeliveryUseCase` verifica que as entradas do razão somam zero e que `CREATOR_AVAILABLE` cresceu exactamente `creatorNetMinor`;
- **a idempotência**, onde existe — executar duas vezes com a mesma chave produz um único efeito;
- **a autorização**, onde o caso de uso a decide — um terceiro obtém o erro de recurso inexistente.

Exemplo do que se espera de `ApproveDeliveryUseCase`:

```
✓ aprova entrega e liberta o escrow numa só transacção
✓ credita ao criador exactamente o líquido e à plataforma exactamente a comissão
✓ as entradas do razão somam zero
✓ concede ContentGrant ao comprador
✓ escreve mensagem STATE_CHANGE na conversa
✓ enfileira notificação de dinheiro libertado
✓ executar duas vezes não duplica lançamentos          (RN-104)
✓ recusa aprovar com disputa aberta                     (RN-048)
✓ recusa aprovar em estado diferente de DELIVERED
✓ terceiro que não é o comprador obtém ResourceNotFoundError
```

### 16.3 Duplos de teste

Repositórios em memória que implementam a mesma porta que os do Prisma, e guardam os dados em `Map`. `FakePaymentsGateway` com cenários provocáveis. `FakeNotificationChannel` que acumula envios. `FakeStorage` que devolve URLs determinísticas. Um relógio injectável — nenhum teste de prazo depende de esperar tempo real.

### 16.4 O que exige Postgres a sério

Restrições que só o Postgres garante não se testam com falsos: unicidade parcial de `payment_intents`, `EXCLUDE` das janelas de disponibilidade, revogação de escrita no razão, e as corridas de concorrência de RN-034 e RN-053. Esses testes correm contra base de dados real em esquema descartável por ficheiro.

### 16.5 Corridas que têm de ter teste

| Cenário | Esperado |
|---|---|
| Dois compradores, uma vaga | Um `Deal` criado, o outro 409 |
| Dois pedidos de levantamento do saldo total | Um aceite, o outro 422 |
| Webhook de captura entregue duas vezes | Um lançamento no razão |
| Aprovação e decisão de disputa em simultâneo | Um dos dois falha; escrow move-se uma só vez |
| Duas tentativas de pagamento no mesmo `Deal` | Uma intenção activa |

### 16.6 Frontend

Testa-se comportamento visível, não implementação: o conteúdo bloqueado mostra preço e não mostra corpo; a acção de pagar fica desactivada fora do estado certo; a mensagem optimista reconcilia com a persistida; os valores monetários são formatados em Kwanza a partir da string de cêntimos, sem passar por `Number`.

---

## 17. Faseamento em fatias verticais

> **Este capítulo foi substituído por `docs/plano.md`, e é o plano que vale.**
> O faseamento abaixo só provava a decisão estruturante do sistema — pedido,
> pagamento, conversa e entrega como a mesma entidade — ao fim de quatro fatias.
> O plano re-cortou-o para que a primeira fatia atravessasse o ciclo inteiro com
> pagamento simulado, e a decisão ficasse provada ou refutada na primeira
> semana. A correspondência entre os dois faseamentos está no topo do plano.
> Mantém-se aqui por ser o raciocínio original, não por ser a ordem a seguir.

Cada fatia atravessa base de dados, caso de uso, API e ecrã, e termina utilizável.

### Fatia 1 — Identidade e perfil público
Migrações 001–002. Registo com telefone, criação de perfil, publicação, `/{handle}` a servir conteúdo público.
*Pronta quando:* um criador publica um perfil e um estranho o abre pela ligação.
*Depende de:* DP-01 (autenticação).

### Fatia 2 — Conteúdo e media
Migração 002 completa. Carregamento assinado, posts públicos e bloqueados, pré-visualização desfocada, playlists.
*Pronta quando:* o conteúdo bloqueado aparece com preço e o original é inacessível sem direito.

### Fatia 3 — Ofertas e o Deal sem dinheiro
Migrações 003–004. Criar pedido, aceitar, recusar, contrapor, conversar, entregar, aprovar. Sem pagamento: o escrow ficaria em `PENDING` e a passagem ao trabalho seria accionada manualmente em desenvolvimento. (Com DP-15 isto deixou de fazer sentido: sem pagamento não há nada para o criador decidir.)
*Pronta quando:* um pedido percorre `PROPOSED → APPROVED` com conversa e entrega reais.

### Fatia 4 — Dinheiro
Migrações 005–006. `FakePaymentsGateway`, intenções, webhook, escrow, razão de partidas dobradas, carteira como projecção.
*Pronta quando:* um `Deal` chega a `PAID`, o razão soma zero e o saldo do criador bate certo.

### Fatia 5 — Levantamentos e verificação de identidade
Verificação com revisão por administração, pedido de levantamento, reserva, aprovação, confirmação, estorno em falha.
*Pronta quando:* um criador verificado levanta e o razão reflecte cada passo.

### Fatia 6 — Marcas e facturação
Migração 008. Conta de empresa com NIF, `Deal` em nome da marca, emissão numerada, PDF protegido.
*Pronta quando:* uma marca contrata e recebe factura válida.
*Depende de:* DP-06 (requisitos AGT).

### Fatia 7 — Confiança
Avaliações, disputas, decisão por administração, devolução.
*Pronta quando:* uma disputa decidida a favor do comprador devolve o dinheiro e o razão fecha.

### Fatia 8 — Disponibilidade e agendamento
Migração 003 completa. Janelas, vagas, estados de disponibilidade, `BOOKING`.
*Pronta quando:* a última vaga é disputada por dois compradores e só um ganha.

### Fatia 9 — Tempo real e notificações
Canal por `Deal`, push, SMS e e-mail.
*Pronta quando:* a mensagem aparece sem recarregar e a notificação de pagamento chega.
*Depende de:* DP-02, DP-03.

### Fatia 10 — Operação
Reconciliação, painel de administração, métricas, alertas, auditoria consultável.
*Pronta quando:* uma divergência injectada de propósito é detectada e alerta.

**Substituir o `FakePaymentsGateway` pela implementação real do parceiro é uma tarefa transversal**, executável assim que DP-04 fechar, sem tocar em nenhum caso de uso.

---

## 18. Decisões pendentes e perguntas em aberto

### Decisões fechadas durante a implementação

Três decisões que este documento dava por abertas foram fechadas ao escrever o
código, e **o design ganhou as três**. Os capítulos 5, 6, 9 e 11 já estão
reescritos em conformidade; o registo de cada uma, com o que se ponderou, está
em `docs/plano.md`.

**DP-07 · Comissão da plataforma — `5% de cada lado`.** O design cobra a mesma
percentagem às duas partes: no P7 o comprador paga 18 900 por uma oferta de
18 000, e no P16 o criador recebe 17 100 pela mesma oferta. A NaDM fica com 10%
do preço anunciado, metade de cada lado. `Deal.amountMinor` passou a ser **o que
o comprador paga**, e o razão passou de três entradas a quatro na libertação.
Configurável por `PLATFORM_FEE_BP`; escalões por volume continuam por decidir e
não bloqueiam nada.

**DP-15 · O comprador paga antes de o criador aceitar.** O SDD tinha o
contrário: aceitar, depois pagar. O design mostra o pedido em «À espera» já com
o valor retido, e a sequência é briefing (P6) → pagamento (P7) → pedido criado
(P8). `PROPOSED` passou a ter duas caras, distinguidas pelo escrow; T2 exige
escrow em `HELD`; T7 e T14 deixaram de existir.

**DP-16 · A contraproposta acerta o escrow.** Com o dinheiro retido desde a
proposta, aceitar um preço diferente deixou de ser mudar um número. Das três
saídas possíveis — só antes do pagamento, com acerto, ou só para baixo —
escolheu-se o acerto, porque é o que o design faz: o P14 contrapõe **para cima**
(350 000 → 420 000) e a marca já tem o dinheiro retido. O reforço usa a mecânica
do pagamento inicial, o que mantém a ordem de DP-15 intacta. Ver §5.2.

*Fica em aberto:* o design diz que a marca pode «responder outra vez», ou seja
contrapropor de volta. Essa transição não existe na tabela de §5.1 e não foi
implementada. Precisa de decisão antes de F8.

### Decisões que bloqueiam trabalho

**DP-01 · Autenticação.** Não há pacote de autenticação instalado no repositório. Fica por decidir o mecanismo de sessão, o modo de verificação do telefone, a duração e renovação de credenciais, e se a administração usa o mesmo caminho ou um separado com segundo factor. Bloqueia a Fatia 1.
*Pergunta:* qual é o mecanismo de autenticação a adoptar e como se verifica o telefone angolano no registo?

**DP-02 · Transporte de tempo real.** Não há WebSocket nem equivalente instalado. Bloqueia a Fatia 9; até lá, sondagem periódica serve.
*Pergunta:* WebSocket próprio, ou serviço gerido?

**DP-03 · Fornecedores de notificação.** Push, SMS e e-mail por decidir. O SMS em Angola tem custo e cobertura por operadora que afectam a matriz do capítulo 14.
*Pergunta:* que fornecedores, e qual o custo por SMS que justifica manter os três casos de envio previstos?

**DP-04 · Parceiro de pagamentos MULTICAIXA Express.** Por fechar. Afecta o formato do `providerReference`, o esquema do webhook, a existência de devolução por API e os prazos de liquidação.
*Perguntas:* (a) o parceiro suporta devolução total e parcial por API, ou a devolução é transferência manual? (b) qual o prazo de liquidação entre captura e disponibilidade dos fundos? (c) o webhook é assinado por HMAC, e com que cabeçalho? (d) há ambiente de testes com números de simulação?

**DP-05 · Prazo de contestação após aprovação.** O desenho actual torna `APPROVED` definitivo e não admite disputa depois. É o mais simples, e pode ser demasiado duro para o comprador.
*Pergunta:* existe janela de contestação após a aprovação e, se sim, de quantos dias — sabendo que isso obriga a atrasar a libertação do escrow ou a prever recuperação de valor já libertado?

**DP-06 · Requisitos de facturação da AGT.** A série, o formato, a assinatura do documento e a eventual certificação de software de facturação em Angola determinam o desenho do capítulo 8.8.
*Perguntas:* (a) a NaDM emite factura em nome próprio pela comissão, em nome do criador pelo serviço, ou ambas? (b) é exigida certificação do software? (c) qual a taxa de IVA aplicável a serviços digitais e quem é o sujeito passivo?

### Decisões que não bloqueiam, mas mudam o modelo se ficarem para depois

**DP-07 · Comissão da plataforma.** **Fechada** — 5% de cada lado. Ver o início deste capítulo. Escalões por volume continuam por decidir e não bloqueiam nada.

**DP-08 · Cancelamento por acordo.** O enunciado não prevê estado `CANCELLED` e este desenho não o inventou. Na prática, as partes vão querer desistir com o dinheiro já retido.
*Pergunta:* existe cancelamento por acordo mútuo e, se sim, é um estado novo ou uma devolução sem disputa?

**DP-09 · Recorrência da assinatura.** `MEMBERSHIP` está modelada como `ContentGrant` com validade. Falta decidir se a renovação é automática — o que exige mandato de débito no parceiro — ou manual.

**DP-10 · Retenção na fonte.** Se a plataforma tiver de reter imposto sobre o rendimento do criador, entra uma conta `TAX_PAYABLE` na libertação e muda o cálculo do líquido.

**DP-11 · Moeda e mercado.** O modelo tem moeda explícita em cada valor, mas o sistema assume `AOA` em toda a parte. Um segundo mercado exige política de conversão que não está desenhada.

**DP-12 · Retenção de dados e apagamento de conta.** Regista-se sete anos o que toca em dinheiro. Falta a política para conversas, media e perfis quando um utilizador pede eliminação.

**DP-13 · Armazenamento de objectos.** O capítulo 12 assume armazenamento compatível com S3 e URLs assinadas. O fornecedor concreto e a latência a partir de Luanda não estão decididos.

**DP-17 · Cifra em repouso de dados sensíveis.** `payouts.destination` e
`identity_verifications.document_number` estão guardados em claro. Não saem da
API nem do registo estruturado — as leituras devolvem só máscaras, e há teste
que percorre as respostas à procura dos valores completos — mas um acesso
directo à base de dados lê-os. Não há biblioteca de cifra na stack e inventar
uma não é decisão de implementação. Bloqueia produção, não bloqueia fatias.
*Perguntas:* (a) cifra na aplicação com chave gerida à parte, cifra ao nível da
coluna no Postgres, ou cofre externo? (b) quem tem acesso à chave, e como se
roda? (c) a administração precisa de ver o destino completo para dar a ordem ao
parceiro — como é que isso se concilia com a cifra?

**DP-14 · Limites de utilização.** Não há política de limitação de pedidos definida para criação de `Deal`, envio de mensagens e tentativas de pagamento.

---

## As cinco decisões mais caras de reverter

Se alguma destas estiver errada, reescreve-se muito código.

### 1. `Deal` como entidade única de pedido, pagamento, conversa e entrega
**Está em:** todo o capítulo 4, a autorização inteira, as rotas de `/deals`, a estratégia de testes.
**Se estiver errada:** separar mais tarde obriga a partir a tabela, a reescrever todas as regras de autorização — que hoje se resolvem com uma pergunta e passariam a quatro — e a migrar dados com histórico de estados. É a decisão estruturante; é também a que o produto define como sua regra central.
**Sinal de alarme:** aparecer a necessidade de conversa sem pedido, ou de um pagamento que cobre vários pedidos.

### 2. Razão de partidas dobradas com `Wallet` como projecção
**Está em:** capítulos 8 e 11, casos de uso de aprovação, devolução e levantamento, toda a reconciliação.
**Se estiver errada — isto é, se se tivesse escolhido um campo de saldo actualizado directamente:** não há volta atrás barata. Reconstruir o histórico de saldos a partir de um campo mutável é impossível; ficaria um período sem auditoria. A decisão é conservadora de propósito.
**Sinal de alarme:** pressão para actualizar `Wallet` directamente por causa de desempenho.

### 3. `offerSnapshot` imutável no `Deal`
**Está em:** RN-041, criação de `Deal`, contraproposta, facturação, disputas.
**Se estiver errada:** ler o preço pela oferta viva parece mais simples até ao dia em que um criador muda o preço e todos os `Deal` passados mudam de valor, incluindo os já facturados. Corrigir depois exige reconstruir preços históricos a partir de pagamentos, o que só funciona para os que foram pagos.
**Sinal de alarme:** consultas que fazem `join` a `offers` para obter o preço de um `Deal`.

### 4. Acesso a conteúdo pago exclusivamente por `ContentGrant` e URL assinada
**Está em:** capítulos 10 e 12, RN-024 e RN-080 a RN-083, todos os caminhos de leitura de conteúdo.
**Se estiver errada — ou seja, se algum caminho decidir acesso por outro critério:** o problema não é refactorização, é fuga de conteúdo pago. Objectos em armazenamento público não se tornam privados retroactivamente: o que foi copiado, foi copiado. Uma única rota que sirva um caminho directo anula a regra inteira.
**Sinal de alarme:** qualquer `storageKey` a chegar à resposta da API.

### 5. Escrow com duas máquinas de estado separadas, comercial e financeira
**Está em:** capítulo 5, `Deal.status` e `Deal.escrowStatus`, cada transição das tabelas T e E.
**Se estiver errada — se estado comercial e financeiro fossem um só:** não haveria como representar um `Deal` entregue com dinheiro ainda retido por disputa, nem um `Deal` devolvido que foi entregue. Juntar agora e separar depois obriga a reinterpretar o histórico de todos os `Deal` fechados para inferir qual era o estado do dinheiro em cada momento.
**Sinal de alarme:** aparecer um estado combinado do género `DELIVERED_BUT_NOT_PAID`.
