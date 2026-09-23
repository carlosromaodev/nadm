# NaDM — Plano de Execução

Versão 1.0 · 17 de Setembro de 2026 · Base: [docs/sdd.md](./sdd.md) v1.0 aprovado

---

## Como este plano se relaciona com o SDD

O capítulo 17 do SDD faz um faseamento por camadas de domínio: identidade, depois conteúdo, depois pedido, e só na quarta fatia o dinheiro. **Este plano re-corta esse faseamento**, por instrução explícita: a primeira fatia passa a ser o ciclo completo do negócio, ponta a ponta, com pagamento simulado.

A razão é boa e vale registá-la. O faseamento do SDD entrega funcionalidade cedo, mas só prova a decisão estruturante do sistema — pedido, pagamento, conversa e entrega como a mesma entidade — ao fim de quatro fatias. Se essa decisão estiver errada, descobre-se tarde e com muito código escrito por cima. Uma primeira fatia que atravessa o ciclo inteiro, mesmo estreita, converte a decisão número 1 da lista de decisões caras de reverter em código executável na primeira semana.

O que se troca por isso: as fatias 1 a 3 deste plano fazem trabalho que o SDD distribuía por 1, 3 e 4, e algumas tabelas nascem com menos colunas do que a especificação final prevê. Cada fatia declara o que deixa em dívida e qual a fatia que a paga.

### Correspondência com o capítulo 17 do SDD

| Fatia do SDD | Onde foi parar neste plano |
|---|---|
| 1 Identidade e perfil | Mínimo em F1, completa em F2 |
| 2 Conteúdo e media | F3 |
| 3 Ofertas e Deal sem dinheiro | Mínimo em F1, resto em F2 |
| 4 Dinheiro | F1 (caminho feliz) e F4 (caminhos de falha) |
| 5 Levantamentos e verificação | F5 |
| 6 Marcas e facturação | F8 |
| 7 Confiança | F6 |
| 8 Disponibilidade | F7 |
| 9 Tempo real e notificações | F9 |
| 10 Operação | F10 |

---

## Sequência e dependências

```
        ┌──────────────────────────────────────────┐
        │  F1  Ciclo completo (esqueleto caminhante)│
        └───────────────────┬──────────────────────┘
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
      ┌──────────┐   ┌────────────┐   ┌──────────┐
      │ F2 Perfil│   │ F3 Media e │   │ F4 Falhas│
      │  público │   │ conteúdo   │   │ e prazos │
      └────┬─────┘   └─────┬──────┘   └────┬─────┘
           │               │               │
           │               ▼               ▼
           │         ┌──────────┐   ┌────────────┐
           │         │ F7 Vagas │   │ F5 Carteira│
           │         │ e agenda │   │ levantam.  │
           │         └──────────┘   └─────┬──────┘
           │                              ▼
           │                        ┌──────────┐
           └───────────────────────►│F6 Confian│
                                    │ça: disput│
                                    └────┬─────┘
                                         ▼
                          ┌──────────────────────────┐
                          │ F8 Marcas · F9 Tempo real│
                          │ F10 Operação             │
                          └──────────────────────────┘

  Transversais, entram quando a decisão pendente fechar:
  T-A Autenticação real (DP-01)   T-B Parceiro de pagamentos (DP-04)
```

**Regra de ordem:** F1 antes de tudo. F4 antes de F5, porque não se levanta dinheiro de um sistema que ainda não sabe devolvê-lo. F5 antes de F6, porque a decisão de disputa precisa de saber mover dinheiro nos dois sentidos.

---

## Critérios comuns a todas as fatias

Uma fatia só está pronta quando **todos** estes pontos passam. Não há fatia parcialmente pronta.

1. Atravessa base de dados, caso de uso, API e interface, e é utilizável por uma pessoa sem SQL nem cliente HTTP.
2. Todos os casos de uso novos têm ficheiro `.spec.ts` ao lado, com caminho normal, cada caminho de erro declarado, invariantes e autorização. Ver SDD §16.2.
3. As regras do SDD que a fatia declara cobrir têm teste que falha se a regra for violada.
4. `npm test` verde nas duas apps. Nenhum teste dependente de rede ou de relógio real.
5. As migrações correm de raiz numa base vazia e são reversíveis ou explicitamente marcadas como não reversíveis.
6. Nenhum valor monetário passou por `Number` em nenhuma camada.
7. Nenhum caminho de leitura novo decide acesso fora dos guardas declarados no SDD §10.
8. A verificação própria da fatia, descrita em «como se verifica», foi executada e o resultado registado.

---

## F1 · O ciclo completo, com pagamento simulado

> A fatia mais pequena que prova a regra central do produto.

### Objectivo

Um comprador escolhe uma oferta, paga, o dinheiro fica retido, abre-se a conversa com o pedido lá dentro, o criador aceita, entrega, o comprador aprova, e o dinheiro é libertado para a carteira do criador. Tudo numa só entidade `Deal`, com o razão a fechar em zero.

No fim desta fatia, a decisão estruturante do sistema está provada ou refutada em código.

### O que fica feito

**Domínio e dados**
- `User` e `Account` no mínimo indispensável: identificação, telefone, papéis.
- `Profile` com `handle`, e `Offer` de tipo `CUSTOM_SERVICE`, com preço, SLA e revisões.
- `Deal` com `reference`, `offerSnapshot` congelado, `status`, `escrowStatus` e a repartição `amountMinor = platformFeeMinor + creatorNetMinor`.
- `Message` com os quatro tipos, incluindo `STATE_CHANGE` escrita pelo sistema a cada transição.
- `Delivery` com nota, sem ficheiros — os ficheiros chegam em F3.
- `PaymentIntent`, `PaymentEvent`, `idempotency_keys`.
- Razão completo: `LedgerTransaction`, `LedgerEntry` com `UPDATE` e `DELETE` revogados, `Wallet` como projecção.
- `outbox_events` e `audit_logs`, escritos desde o primeiro dia — retrofitar auditoria é sempre pior.

**Transições implementadas** — apenas o caminho feliz: T1, T2, T7, T8, T9, T12 e, do escrow, E1 e E2.

**Casos de uso**

| Caso de uso | Transição | Nota |
|---|---|---|
| `CreateProfileUseCase` | — | mínimo, sem publicação condicionada |
| `CreateOfferUseCase` | — | só `CUSTOM_SERVICE` |
| `CreateDealUseCase` | T1 | congela `offerSnapshot`, abre a conversa |
| `AcceptDealUseCase` | T2 | emite `PaymentIntent` |
| `StartDealPaymentUseCase` | — | `Idempotency-Key` obrigatória |
| `HandlePaymentCapturedUseCase` | E1 + T7 | consome `PaymentEvent`, idempotente |
| `SendMessageUseCase` | — | com `clientId` |
| `SubmitDeliveryUseCase` | T8 | |
| `ApproveDeliveryUseCase` | T9 + T12 + E2 | liberta escrow e lança o razão numa transacção |
| `GetDealUseCase`, `ListDealsUseCase` | — | filtrados por participação |
| `GetProfileByHandleUseCase` | — | perfil e ofertas activas |

**Infra**
- `FakePaymentsGateway` com captura imediata e captura atrasada por webhook simulado.
- `AuthContext` como porta, com adaptador provisório de desenvolvimento. Ver a dívida declarada abaixo.
- Relógio injectável desde o início.

**API** — `POST /profiles`, `POST /offers`, `GET /profiles/:handle`, `POST /deals`, `GET /deals`, `GET /deals/:id`, `POST /deals/:id/accept`, `POST /deals/:id/payments`, `POST /webhooks/payments/fake`, `GET|POST /deals/:id/messages`, `POST /deals/:id/deliveries`, `POST /deals/:id/deliveries/:v/approve`, `GET /wallet`.

**Interface**
- `/{handle}` — perfil com a oferta e o botão de contratar.
- `/deals/:id` — o ecrã que prova a tese: conversa, estado, valores e acções, tudo na mesma página. O pedido aparece como primeira mensagem, as transições aparecem na linha do tempo.
- `/deals` — lista, alternando entre comprador e criador.
- `/wallet` — saldo lido do razão.

### O que fica de fora

Recusa, contraproposta, rejeição de entrega, revisões, expiração de prazos, aprovação automática, disputas, devoluções, levantamentos, avaliações, ficheiros e media, conteúdo pago, playlists, assinaturas, agendamento e vagas, facturação, verificação de identidade, notificações, tempo real, administração, reconciliação, publicação condicionada de perfil, edição de perfil ou de oferta, paginação por cursor — lista curta basta —, autenticação real.

### Migrações

| # | Nome | Conteúdo |
|---|---|---|
| 001 | `identity_minimal` | `users`, `accounts`, enumerados de papel e estado |
| 002 | `profiles_offers` | `profiles` com `UNIQUE(lower(handle))`, `offers` com `CHECK(price_minor >= 0)` |
| 003 | `deals_conversation` | `deals` com `CHECK(amount_minor = platform_fee_minor + creator_net_minor)` e `UNIQUE(reference)`, `messages`, `deliveries`; sequência de `reference` |
| 004 | `payments` | `payment_intents` com `UNIQUE(provider_reference)`, `UNIQUE(idempotency_key)` e índice único parcial `(deal_id) WHERE status IN ('CREATED','PENDING')`; `payment_events` com `UNIQUE(provider_event_id)`; `idempotency_keys` |
| 005 | `ledger` | `ledger_transactions` com `UNIQUE(kind, external_reference)`, `ledger_entries` com `CHECK(amount_minor > 0)`, `wallets`, e `REVOKE UPDATE, DELETE` ao papel da aplicação |
| 006 | `ops` | `outbox_events`, `audit_logs`, com a mesma revogação |
| 007 | `message_ordering` | `messages.seq` BIGSERIAL — acrescentada durante a implementação: mensagens escritas na mesma transacção partilham o `created_at` ao milissegundo e desempatar por UUID dava ordem aleatória na conversa |

### Regras do SDD cobertas

RN-040, RN-041, RN-042, RN-043, RN-049 · RN-060, RN-063, RN-065 · RN-090, RN-091, RN-092, RN-093 · RN-100, RN-101, RN-102, RN-103, RN-104, RN-110, RN-111 · RN-030 parcialmente, só `CUSTOM_SERVICE`.

### Como se verifica que está pronta

**1. Teste ponta a ponta contra Postgres real**, um ficheiro, o percurso completo:

```
✓ comprador cria Deal a partir da oferta e a conversa abre com o pedido lá dentro
✓ o preço do Deal vem do offerSnapshot e não da oferta viva
✓ criador aceita e é emitido um PaymentIntent
✓ pagamento simulado capturado move escrow para HELD e o Deal para IN_PROGRESS
✓ criador entrega, comprador aprova, Deal termina em PAID
✓ o razão tem duas transacções, cada uma soma zero
✓ CREATOR_AVAILABLE cresceu exactamente creator_net_minor
✓ a Wallet bate certo com a soma do razão
✓ a conversa tem uma mensagem STATE_CHANGE por cada transição
```

**2. Testes de corrida, com Postgres real**
- duas tentativas de pagamento simultâneas no mesmo `Deal` → uma intenção activa, a outra 409;
- o mesmo evento de captura entregue duas vezes → um único lançamento no razão;
- `ApproveDeliveryUseCase` executado duas vezes → um único par de lançamentos, por `ledger:release:{dealId}`.

**3. Verificação manual, no browser, sem tocar em SQL**
Seed cria um criador com uma oferta. Como comprador: abrir `/{handle}`, contratar, ver o `Deal`. Como criador: aceitar. Como comprador: pagar, escrever mensagem. Como criador: entregar. Como comprador: aprovar. Confirmar em `/wallet` que o saldo do criador subiu o valor líquido.

**4. Verificação de integridade**
Uma consulta que soma `amount_minor` por transacção e devolve zero linhas com soma diferente de zero. Executada no fim do percurso manual.

**5. Prova negativa**
Um terceiro autenticado que abre `/api/deals/:id` de um `Deal` alheio recebe **404**, e a conversa não aparece em `GET /deals`.

### Dívida declarada por esta fatia

| Dívida | Porquê | Paga em |
|---|---|---|
| Autenticação provisória de desenvolvimento, atrás da porta `AuthContext` | DP-01 está aberta e não se decide aqui | T-A. Até lá, o adaptador provisório **falha o arranque** se `NODE_ENV=production` |
| `Delivery` sem ficheiros | Media é uma fatia inteira e não é preciso para provar a tese | F3 |
| `Offer` só de tipo `CUSTOM_SERVICE` | Os outros tipos têm fluxos próprios | F3 e F7 |
| Sem paginação por cursor | Volume irrelevante nesta fase | F2 |
| Perfil publica sem validar RN-011 | A regra pertence ao perfil público completo | F2 |

---

## F2 · Perfil público completo

### Objectivo
O perfil deixa de ser um suporte de teste e passa a ser a montra do criador, descobrível por ligação partilhada numa rede social.

### O que fica feito
Edição de perfil, `handle` com regras RN-010 e RN-012 e lista de reservados, publicação condicionada por RN-011, disponibilidade `AVAILABLE`/`PAUSED`, catálogo de ofertas com edição, pausa e arquivo, paginação por cursor nas listagens, tratamento de perfil inexistente ou não publicado. Ecrã de gestão do perfil para o criador.

### O que fica de fora
Conteúdo e media — é F3. Avaliações — F6. Estado `NO_SLOTS` — F7, porque depende de vagas.

### Migrações
| # | Nome | Conteúdo |
|---|---|---|
| 007 | `profile_public` | colunas de bio, categoria, tempo de resposta, `published_at`, `availability_status`; índice `(availability_status, published_at)` |

### Regras cobertas
RN-010, RN-011, RN-012, RN-030, RN-032.

### Como se verifica
Um perfil sem oferta nem publicação não publica e devolve 422. Um `handle` reservado devolve 409. Um `handle` alterado ao 31.º dia devolve 422. Arquivar uma oferta não altera um `Deal` em curso criado sobre ela — teste que compara o `offerSnapshot` antes e depois. Perfil em `PAUSED` continua visível e não aceita novos `Deal`.

---

## F3 · Media e conteúdo pago

### Objectivo
Conteúdo bloqueado que se compra e desbloqueia, e entregas com ficheiros — a segunda decisão mais cara de reverter, a de acesso exclusivamente por `ContentGrant` e URL assinada.

### O que fica feito
Carregamento directo para armazenamento com URL assinada de escrita, ciclo `UPLOADING → SCANNING → READY`, escopos `PUBLIC_ASSET` e `PROTECTED`, `storageKey` opaco. Posts `PUBLIC` e `LOCKED`, playlists, pré-visualização desfocada gerada no carregamento. Oferta `CONTENT_UNLOCK` com o percurso automático do UC-09. `ContentGrant` como única fonte de verdade de acesso. `GET /media/:id/url` com validade máxima de 15 minutos. `DeliveryAsset` com marca de água antes da aprovação.

### O que fica de fora
Vídeo com derivações de resolução e transcodificação — fica para depois de F10, porque não bloqueia nada. Posts `MEMBERS` e assinaturas, dependentes de DP-09.

### Migrações
| # | Nome | Conteúdo |
|---|---|---|
| 008 | `media` | `media` com `UNIQUE(storage_key)` |
| 009 | `content` | `posts` com `CHECK(visibility <> 'LOCKED' OR price_minor > 0)`, `playlists`, `playlist_items` |
| 010 | `grants_delivery_assets` | `content_grants` com `UNIQUE(user_id, subject_type, subject_id)`, `delivery_assets` |

### Regras cobertas
RN-020, RN-022, RN-023, RN-024 · RN-045, RN-061 · RN-080, RN-081, RN-082, RN-083.

### Como se verifica
Pedir a URL de uma media protegida sem direito devolve **404**. A URL assinada expira e, expirada, o armazenamento recusa. Nenhuma resposta da API contém `storageKey` — teste que percorre o corpo de todas as respostas do conjunto de testes à procura do valor. Comprar um post concede acesso; tornar o post público depois não revoga nada; tornar público um post e voltar a bloqueá-lo não retira o acesso a quem comprou. Comprar uma playlist e acrescentar-lhe um item depois: o item novo continua inacessível. Os ficheiros de uma entrega não aprovada chegam com marca de água, e o original não é alcançável por nenhuma rota.

---

## O que F3 entregou — e porque é que não estava entregue

**F3 estava escrita e inalcançável.** O domínio, os cinco casos de uso, o
armazenamento local e o assinador de URLs existiam e estavam bem feitos — mas
não havia `content.module.ts`, não havia controlador, o módulo **não estava
registado em `app.module.ts`** e não havia **um único teste**. Era código morto:
nada na aplicação lhe chegava, e nada provava que funcionava.

### O que ficou feito

- **Módulo, controlador e registo.** As rotas de `/media`, `/content` e
  `/profiles/:handle/content` passaram a existir.
- **Specs dos cinco casos de uso** e do controlo de acesso, 36 testes, incluindo
  os que provam o que CLAUDE.md lista como inegociável.
- **Verificação ponta a ponta de RN-080**: um teste percorre o corpo das
  respostas da API à procura do `storageKey` **real, lido da base de dados**, e
  confirma que não aparece em nenhuma — nem na auditoria.
- **UC-09, a compra de conteúdo bloqueado.** Era o que faltava para F3 ter o que
  a fatia promete: conteúdo que se compra e desbloqueia.

### A compra, e a decisão que exigiu

`save-content` recusava publicar conteúdo pago: *«Guarda como rascunho. A
publicação paga aguarda a integração de pagamentos e direitos de acesso.»* Os
pagamentos existem desde F1 e os direitos desde a migração 009 — o que faltava
era a ligação.

**Comprar conteúdo é comprar como tudo o resto na NaDM**: um `Deal`, com escrow,
razão e conversa. E um `Deal` precisa de uma `Offer`. Por isso publicar conteúdo
pago passa a criar a oferta `CONTENT_UNLOCK` correspondente, com o preço da
publicação — o criador põe o preço uma vez, e não gere duas coisas para vender
uma. A migração 021 liga as duas, com único parcial e `CHECK` a garantir que só
ofertas de desbloqueio apontam para conteúdo.

Capturado o pagamento, **o `Deal` percorre o resto do caminho de uma vez** — T2,
T8, T9 e T12 — e o `ContentGrant` é concedido **na mesma transacção**. Não há
nada para o criador aceitar nem para entregar: o ficheiro já existe, e o que
faltava era o direito de o ver. Ou o comprador fica com o acesso e o criador com
o dinheiro, ou não acontece nada.

### Três correcções que isto obrigou

**A libertação do escrow foi extraída para `EscrowReleaseService`.** Estava
dentro do `ApproveDeliveryUseCase`, e passou a ter dois chamadores — a aprovação
de uma entrega e o desbloqueio automático. Uma segunda cópia da lógica que move
dinheiro seria uma segunda oportunidade de a escrever mal.

**`@OptionalUser()`, para as rotas públicas que mostram mais a quem tem sessão.**
O catálogo de um perfil mostra o que é público a toda a gente e acrescenta o que
**esta** pessoa comprou. `@CurrentUser()` não servia porque recusa quem não tem
sessão, e o ponto era deixá-lo entrar.

**O guarda passou a resolver o utilizador nas rotas públicas.** Devolvia `true`
antes de o resolver, por isso o visitante com sessão nunca era visto — e sem
isso «acrescenta o que esta pessoa comprou» não podia funcionar. O que mudou é
que a ausência de sessão deixou de ser erro numa rota pública; continuar a ser
erro nas outras.

### O que continua de fora

**`MEMBERS` continua fechado**, e agora com a razão certa no código: a
recorrência de assinatura é **DP-09**, e sem ela um direito de membro não sabe
quando expira.

Ficam também de fora as **derivações de resolução de vídeo e a transcodificação**
— que o plano já mandava para depois de F10 — e a **marca de água nas entregas
antes da aprovação** (RN-045), que depende de processamento de imagem que a
stack não tem.

### Dívida declarada por esta fatia

| Dívida | Porquê | Paga em |
|---|---|---|
| Armazenamento em disco local | O fornecedor de objectos é DP-13 | Quando DP-13 fechar |
| Sem marca de água em entregas | Exige processamento de imagem que a stack não tem | Decisão de stack |
| Posts `MEMBERS` fechados | Recorrência é DP-09 | Quando DP-09 fechar |
| Sem playlists com itens acrescentados depois | O caso está no SDD (RN-023) e não há procura | Quando houver uso real |

---

## F4 · Caminhos de falha e prazos

### Objectivo
O `Deal` deixa de ter só o caminho feliz. É onde o desenho das máquinas de estado é posto à prova.

### O que fica feito
Transições T3 recusa, T4/T5/T6 contraproposta com acerto do escrow, T11 rejeição de entrega com revisões, T13 expiração, T10 aprovação automática às 72 h, T16 devolução por atraso, e E3 e E4 no escrow. Devolução no razão com `REFUNDS_PAYABLE`. Agendador para os prazos, sobre o relógio injectável de F1. Contagem de revisões com RN-044.

**T14 não existe.** Era `ACCEPTED → EXPIRED` por falta de pagamento depois de aceitar; com DP-15 não há pagamento depois de aceitar. Uma intenção que expira deixa o pedido em `PROPOSED` por pagar, e quem o fecha é T13.

### O que fica de fora
Disputa — F6, porque exige administração. Cancelamento por acordo — bloqueado por DP-08.

### Migrações
| # | Nome | Conteúdo |
|---|---|---|
| 012 | `deal_lifecycle` | `revision_count` com `CHECK >= 0`, `closed_at`, e três índices parciais para os varrimentos: `(expires_at) WHERE status IN ('PROPOSED','COUNTER_OFFERED')`, `(delivered_at) WHERE status = 'DELIVERED'`, `(due_at) WHERE status IN ('ACCEPTED','IN_PROGRESS')` |
| 013 | `counter_offers` | `deal_counter_offers` com índice único parcial `(deal_id) WHERE status = 'PENDING'`; `payment_intents.purpose` e `counter_offer_id`, com `CHECK` a ligar os dois |

*O número mudou de 011 para 012: F2, F3 e F6 consumiram 008 a 011 antes de F4
arrancar.*

### Regras cobertas
RN-044, RN-093 · RN-094 · e as consequências de prazo do SDD §5.1.

### Como se verifica
Com o relógio avançado artificialmente: uma proposta sem resposta em 48 h fica `EXPIRED` e o dinheiro volta; o mesmo para uma contraproposta sem resposta do comprador; uma entrega sem resposta em 72 h é aprovada automaticamente e o autor registado é o sistema. Rejeitar mais vezes do que as revisões incluídas devolve 422. Uma devolução gera transacção de razão que soma zero e deixa `ESCROW` a zero para aquele `Deal`. Uma captura com valor diferente do esperado não move o escrow e cria registo de reconciliação. Nenhum prazo é verificado por espera real em teste.

---

## O que F4 entregou, e o que não

**Feito e verificado**, contra Postgres real em `apps/api/test/deal-failure-paths.e2e-spec.ts`:

- **T3** recusa pelo criador, com estorno automático quando o pedido já estava
  pago e fecho da intenção de pagamento quando não estava.
- **T11** rejeição de entrega com contagem de revisões (RN-044), prazo novo
  contado da rejeição e o dinheiro a ficar exactamente onde estava.
- **T13** expiração da proposta, agora **com estorno** — a consequência de
  DP-15 que tinha ficado declarada em aberto no fim de F1.
- **T10** aprovação automática findo o prazo, pelo mesmo caminho da aprovação
  humana, registada na auditoria como acto do sistema.
- **T16** devolução por atraso, pedida pelo comprador depois de `dueAt` mais a
  tolerância. O direito nasce do tempo; a devolução não é automática.
- **E3** estorno `DÉBITO ESCROW / CRÉDITO REFUNDS_PAYABLE`, com chave semântica
  `ledger:refund:{dealId}`, e **E4** para o pedido que morre sem nunca ter sido
  pago, onde não há lançamento nenhum a fazer.
- Agendador dos prazos sobre o relógio injectado, um pedido por transacção,
  retomável sem guardar estado sobre si próprio. `DEAL_DEADLINE_SWEEP_MS=0`
  desliga-o, e é assim que os testes correm.
- Interface: recusar em P23, pedir alteração em P9 com o contador real de
  revisões, e pedir devolução na conversa quando o prazo cai.

### Um defeito de F1 corrigido por F4

**A captura nunca lançava no razão.** O SDD §5.2 declara que E1 escreve
`DÉBITO PROVIDER_CLEARING / CRÉDITO ESCROW`, e F1 movia o `escrowStatus` sem o
fazer. A conta `ESCROW` só era debitada na libertação, sem nunca ter sido
creditada, e o saldo por `Deal` ficava permanentemente negativo — uma
divergência que a reconciliação de F10 apanharia no primeiro ciclo.

Não dava para adiar: o estorno de F4 debita `ESCROW` outra vez, e sem a entrada
da captura estaria a devolver dinheiro que o razão nunca registou ter entrado.
Está implementado em `HandlePaymentCapturedUseCase`, com chave semântica
`ledger:capture:{dealId}`. **O ciclo completo passou de uma transacção de razão
para duas**, como o próprio plano de F1 sempre disse que deviam ser.

### A contraproposta, com acerto — DP-16 · **decidido**

T4, T5 e T6 estão implementadas, com a opção 2 das três que estavam em cima da
mesa: **aceitar acerta o escrow**. A decisão foi do design, como as duas
anteriores.

**O que o design diz.** O ecrã é o P14, o pedido de uma marca, com as três
saídas — *Aceitar · Contrapropor · Recusar*. O P23, onde o fã contrata, tem
*Aceitar · Pedir mais detalhe · Recusar*, e não tem contraproposta nenhuma. O
dinheiro da marca está retido como o do fã — «se não responderes, o pedido
expira e o dinheiro volta à empresa» — e a contraproposta do design é **para
cima**: `campanha: 350 000 → contra: 420 000`. Cobrar a diferença não era, por
isso, o caso excêntrico; era o caso normal.

**Como o acerto funciona.** Três casos, e a diferença entre eles é só onde está
o dinheiro:

| | O que acontece |
|---|---|
| preço sobe | o comprador reforça a diferença, e **é a captura desse reforço que dispara T5**. Enquanto não pagar, o pedido fica em `COUNTER_OFFERED` e o escrow vale o preço antigo |
| preço desce | estorno parcial `DÉBITO ESCROW / CRÉDITO REFUNDS_PAYABLE`, na mesma transacção que T5 |
| preço igual | só o prazo mudou; não há dinheiro nenhum a mexer |

O reforço reutiliza a mecânica do pagamento inicial — `PaymentIntent` com
`purpose = TOP_UP`, autorização no telemóvel, notificação do parceiro — e é isso
que mantém a ordem de DP-15 intacta: **o dinheiro primeiro, o estado depois**.
Não se inventou mecanismo nenhum para o acerto; usou-se o que já lá estava.

O invariante que tudo isto protege: **um `Deal` em `PROPOSED` com escrow `HELD`
tem no escrow exactamente `deal.amount`.** É o que torna T2 seguro, e é
verificado em `apps/api/test/counter-offer.e2e-spec.ts` nos três casos.

**T5 é a única escrita que altera os valores de um `Deal` depois de criado.** Vive
atrás de `DealsRepository.saveRenegotiated`, separada de `save`, para ser fácil
de encontrar em revisão — a regra continua a ser que preço e snapshot são
imutáveis (RN-041), e a renegociação é a excepção declarada. O `offerSnapshot`
ganhou `version`: 1 no original, e mais um a cada contraproposta aceite.

**A interface é F8.** As transições são do `Deal` e não do ecrã, por isso vivem
já no domínio; quem as expõe é o P14, que pertence às marcas.

*Fica em aberto:* o design diz que a marca pode «responder outra vez», ou seja
contrapropor de volta — `COUNTER_OFFERED → COUNTER_OFFERED` pelo comprador. Não
existe na tabela do SDD §5 e não foi implementada.

### O que ficou de fora, e porquê

O **cancelamento por acordo**, bloqueado por DP-08, e **T15**, que é disputa e
pertence a F6.

### Dívida declarada por esta fatia

| Dívida | Porquê | Paga em |
|---|---|---|
| `REFUNDS_PAYABLE` acumula sem nunca ser liquidada | Devolver ao comprador de verdade exige o parceiro de pagamentos | T-B, com DP-04 |
| O agendador é um intervalo no processo da API | Uma fila a sério só se justifica com mais de um consumidor | F10 |
| `T14` do SDD deixou de existir | Com DP-15 não há pagamento depois de aceitar; a intenção expira com o pedido ainda em `PROPOSED` | Reescrita do SDD §5 |
| A contraproposta não tem interface | O ecrã dela é o P14, das marcas | F8 |
| Contrapropor de volta (`COUNTER_OFFERED → COUNTER_OFFERED`) | Não está na tabela do SDD §5 | Decisão, antes de F8 |

---

## F5 · Carteira, verificação de identidade e levantamentos

### Objectivo
O criador tira o dinheiro da plataforma. É o ponto em que um erro no razão passa a ter consequência irreversível.

### O que fica feito
Submissão e revisão de verificação de identidade com documentos `PROTECTED`, `verificationLevel`. Extracto de movimentos do próprio criador. Pedido de levantamento com reserva imediata, aprovação pela administração, confirmação, falha com estorno, cancelamento antes da aprovação. Valor mínimo configurável. Bloqueio de linha para serializar pedidos concorrentes.

### O que fica de fora
Pagamento real ao criador — depende de DP-04; até lá, a confirmação é manual pela administração.

### Migrações
| # | Nome | Conteúdo |
|---|---|---|
| 012 | `identity_verification` | `identity_verifications` com número de documento cifrado |
| 013 | `payouts` | `payouts`, contas `CREATOR_RESERVED` no razão |

### Regras cobertas
RN-050, RN-051, RN-052, RN-053, RN-054 · RN-062.

### Como se verifica
Levantar sem identidade verificada devolve 403. Levantar mais do que o disponível devolve 422, e a verificação é feita sobre o razão, não sobre a `Wallet` — teste que corrompe de propósito a projecção e confirma que o levantamento continua a ser recusado correctamente. Dois pedidos simultâneos do saldo total: um passa, o outro falha. Um levantamento falhado devolve o valor a `CREATOR_AVAILABLE` por estorno, sem alterar nenhuma entrada existente. Um terceiro que pede o extracto de outro criador recebe 404.

---

## O que F5 entregou, e o que não

**Feito e verificado**, contra Postgres real em `apps/api/test/payouts.e2e-spec.ts`:

- **Verificação de identidade** submetida pelo criador e decidida pela
  administração. Aprovar é a **única** coisa no sistema que eleva
  `verificationLevel` para `IDENTITY` — nunca um campo do corpo do pedido.
  Índice único parcial impede duas submissões à espera do mesmo utilizador.
- **Pedido de levantamento** com reserva imediata (RN-052), saldo lido **do
  razão** e nunca da projecção (RN-050), identidade exigida (RN-051) e mínimo
  configurável por `MINIMUM_PAYOUT_MINOR` (RN-054).
- **Bloqueio de linha** no perfil a serializar pedidos concorrentes (RN-053).
  Dois pedidos simultâneos do saldo total: um passa, o outro falha, e o razão
  não fica a dever mais do que tinha.
- **Percurso da administração**: aprovar, enviar ao parceiro, confirmar ou
  falhar. Falha e cancelamento devolvem o valor **por estorno** — as entradas
  que o reservaram ficam onde estão (RN-101).
- **Guarda de papéis** para `/admin/**`, o único sítio do sistema em que o
  papel decide o acesso. Devolve 403, não 404: quem lá chega sem o papel não
  fica a saber nada que já não soubesse.
- **Nada sensível sai da API**: o destino do levantamento e o número do
  documento saem mascarados, e não entram na auditoria. Há um teste que
  percorre as respostas à procura dos valores em claro.

### Dois defeitos corrigidos por F5

**`balanceOf` devolvia sinais opostos nas duas implementações.** A do Prisma
somava `créditos − débitos`; a de teste somava `débitos − créditos`, que é a
convenção do próprio domínio em `LedgerEntry.signedAmount`. As duas carteiras
compensavam de maneiras diferentes e o saldo apresentado acabava certo — mas
`balanceOf` significava coisas opostas conforme quem o chamasse.

F5 ia pisar isto em cheio: RN-050 manda validar o levantamento contra o razão.
Os testes de caso de uso passariam com a implementação em memória, e em
produção o Prisma teria autorizado levantar sobre saldo zero. Está unificado na
convenção do domínio, com um `amountOwed` a fazer a inversão de sinal **num
sítio só** — o que é que se deve a alguém numa conta de passivo.

**A bateria ponta a ponta falhava de vez em quando.** Cada limpeza entre testes
abria um `PrismaClient` novo, e cada um abre o seu pool: a meio da corrida
esgotava-se o `max_connections` do Postgres e um `beforeEach` qualquer rebentava.
Passou a haver um cliente do papel dono partilhado por ficheiro. Quatro corridas
seguidas limpas depois da correcção.

### O que ficou de fora

Pagar ao criador de verdade — depende de DP-04. Até lá a ordem ao parceiro é
dada e confirmada por uma pessoa, e `markProcessing` e `settle` são rotas de
administração. Quando DP-04 fechar, passam a ser accionadas pela notificação do
parceiro e **nenhum caso de uso muda**: muda quem os chama.

Ficam também de fora os documentos digitalizados da verificação — `Media`
`PROTECTED` é de F3 e o fluxo de carregamento existe, mas ligá-lo à submissão
de identidade não era preciso para provar a fatia, e a administração decide
sobre o que o formulário declara.

### Dívida declarada por esta fatia

| Dívida | Porquê | Paga em |
|---|---|---|
| Destino do levantamento e número do documento guardados **em claro** | Não há biblioteca de cifra na stack, e inventar uma não é decisão de implementação | **DP-17**, nova |
| Sem ficheiros na verificação de identidade | O formulário chega para a administração decidir nesta fase | F10, com o painel |
| `PROVIDER_CLEARING` cresce sem nunca ser conciliado com o extracto | Reconciliação é F10 | F10 |
| Sem paginação por cursor no extracto | Volume irrelevante nesta fase | F10 |

**DP-17 · Cifra em repouso de dados sensíveis.** `payouts.destination` e
`identity_verifications.document_number` estão em claro na base de dados. Não
saem da API nem do registo — há teste que o prova — mas um acesso directo à base
lê-os. Falta decidir o mecanismo: cifra na aplicação com chave gerida à parte,
cifra ao nível da coluna no Postgres, ou um cofre externo. **Bloqueia produção,
não bloqueia nenhuma fatia.**

---

## F6 · Confiança: avaliações e disputas

### Objectivo
Existe uma saída quando as partes discordam, e existe reputação pública.

### O que fica feito
Avaliação pelo comprador com resposta única do criador, média no perfil. Abertura de disputa por qualquer parte, bloqueio da libertação do escrow, fila de disputas na administração, decisão a favor de uma das partes com T15 e devolução. Entrada de administração na conversa com mensagens `SYSTEM` e registo de auditoria.

### O que fica de fora
Janela de contestação depois de `APPROVED` — bloqueada por DP-05. Nesta fatia, `APPROVED` continua definitivo.

### Migrações
| # | Nome | Conteúdo |
|---|---|---|
| 014 | `reviews_disputes` | `reviews` com `UNIQUE(deal_id)` e `CHECK(rating BETWEEN 1 AND 5)`; `disputes` com índice único parcial `(deal_id) WHERE status = 'OPEN'` |

### Regras cobertas
RN-046, RN-047, RN-048 · RN-064.

### Como se verifica
Com disputa aberta, a aprovação não liberta o escrow e devolve 422. Decidir a favor do comprador devolve o dinheiro e fecha o razão em zero. Abrir segunda disputa no mesmo `Deal` devolve 409. Avaliar um `Deal` não concluído devolve 422; avaliar duas vezes devolve 409. Um administrador que abre uma conversa sem disputa aberta fica registado na auditoria e a entrada é recusada se não houver investigação registada.

---

## O que F6 entregou, e o que não

**Feito e verificado**, contra Postgres real em `apps/api/test/disputes.e2e-spec.ts`:

- **Disputa aberta por qualquer uma das partes**, em `ACCEPTED`, `IN_PROGRESS`
  ou `DELIVERED`. É das poucas acções do produto sem dono exclusivo: quem não
  recebeu o que pediu e quem não consegue entregar têm o mesmo direito de pedir
  que alguém decida. Abrir **não move dinheiro — trava-o**.
- **RN-048**: com disputa aberta, aprovar devolve 422 e o escrow não se move.
  A aprovação automática por prazo também fica travada. A verificação corre
  **dentro da transacção** da aprovação — uma disputa aberta entre a leitura e
  o lançamento não pode passar despercebida.
- **T15**: a favor do comprador, o `Deal` vai a `REFUNDED` e o escrow é
  estornado na mesma transacção; a favor do criador, nada se move e a
  libertação volta a ser possível pelo caminho normal.
- **RN-064**: a administração só lê a conversa com disputa aberta, e **cada
  leitura fica na auditoria** — escrita antes de o conteúdo ser devolvido, para
  que uma falha reverta tudo e ninguém leia sem deixar rasto. As mensagens da
  administração são `SYSTEM` e sem autor pessoal: quem fala é a NaDM.
- **Avaliação com resposta única do criador**, e média do perfil **em décimas
  inteiras** — 47 é 4,7. Não é dinheiro, mas o princípio é o mesmo: uma média em
  vírgula flutuante arredonda conforme a plataforma, e reputação é coisa que se
  compara.
- Retirar a disputa é só de quem a abriu. Deixar a outra parte fechá-la daria a
  quem está em falta a maneira mais simples de se safar.

### O que o Postgres garante, e a aplicação não

- `disputes_one_open_idx` — uma só disputa aberta por `Deal`. Há teste que abre
  duas em paralelo, uma por cada parte, e confirma que passa uma.
- `disputes_resolution_is_complete` — uma disputa resolvida tem sempre quem
  decidiu, a favor de quem e quando; uma aberta não tem nada disso. Sem a
  restrição, uma decisão podia ficar a meio.
- `GRANT UPDATE ("reply", "replied_at", "updated_at") ON reviews` — o papel da
  aplicação pode responder a uma avaliação e **não pode reescrever a nota nem o
  texto do comprador**. É permissão, não disciplina.

### Uma migração de correcção

A 016 deu o `GRANT UPDATE` por coluna e esqueceu-se de `updated_at`. O modelo
tem `@updatedAt`, o que faz o Prisma escrever essa coluna em todo o `UPDATE`, e
o Postgres recusava a instrução inteira com uma negação ao nível da tabela — que
é enganador de ler. A **017** acrescenta a coluna em falta.

Fica em migração nova, e não corrigida na 016, de propósito: a 016 já tinha sido
aplicada, e reescrever uma migração aplicada quebra a soma de verificação de
quem já a correu.

### O que ficou de fora

**A janela de contestação depois de `APPROVED` continua bloqueada por DP-05**, e
nesta fatia `APPROVED` é definitivo — foi assim que a fatia foi desenhada. Uma
disputa aberta depois de o dinheiro sair obrigaria a recuperar valor já
libertado, o que é um mecanismo por inventar.

O **caminho de investigação registada** de RN-064 — o outro motivo que permite à
administração abrir uma conversa — depende do painel de administração e chega em
F10. Até lá, sem disputa aberta a administração não lê conversa nenhuma.

### Dívida declarada por esta fatia

| Dívida | Porquê | Paga em |
|---|---|---|
| A administração não tem ecrã: a fila e a decisão são chamadas à API | O painel é uma fatia inteira | F10 |
| Sem prazos na disputa — nem para responder, nem para decidir | Os prazos do SDD §5.1 não cobrem a disputa | F10, com o painel |
| Investigação registada de RN-064 por implementar | Depende do painel | F10 |

---

## F7 · Disponibilidade, vagas e agendamento

### Objectivo
Ofertas com capacidade finita, e o estado `NO_SLOTS` derivado.

### O que fica feito
`AvailabilityWindow` com restrição `EXCLUDE` no Postgres, oferta `BOOKING`, consumo de vaga na mesma transacção que cria o `Deal`, devolução da vaga em recusa e expiração, `NO_SLOTS` derivado com precedência de `PAUSED`.

### O que fica de fora
Sincronização com calendário externo — fora do âmbito do produto.

### Migrações
| # | Nome | Conteúdo |
|---|---|---|
| 015 | `availability` | extensão `btree_gist`, `availability_windows` com `EXCLUDE USING gist (offer_id WITH =, tstzrange(starts_at, ends_at) WITH &&)` |

### Regras cobertas
RN-031, RN-033, RN-034.

### Como se verifica
Criar janelas sobrepostas na mesma oferta devolve 422, e a recusa vem do Postgres, não de uma verificação em aplicação — teste que insere directamente e confirma a violação da restrição. Dois compradores para a última vaga: um `Deal` criado, o outro 409. Um `Deal` recusado devolve a vaga e o estado volta a `AVAILABLE`.

---

## O que F7 entregou, e o que não

**Feito e verificado**, contra Postgres real em `apps/api/test/availability.e2e-spec.ts`:

- **`AvailabilityWindow`** por oferta `BOOKING`, com vagas. A não sobreposição
  é uma restrição `EXCLUDE` com `btree_gist` (RN-033), e há teste que **insere
  directamente pelo papel dono**, a contornar a aplicação inteira, para provar
  que a regra é da base de dados e não do caso de uso.
- **A vaga é tomada na transacção que cria o `Deal`** (RN-034), por um `UPDATE`
  condicionado — `SET slots_taken = slots_taken + 1 WHERE slots_taken <
  slots_total`. Não é um `SELECT` seguido de escrita, e é isso que resolve a
  corrida sem bloquear ninguém. Dois compradores pela última vaga: um cria o
  pedido, o outro recebe 409.
- **A vaga volta** em T3 (recusa), T6 (contraproposta recusada) e T13
  (expiração), na mesma transacção que fecha o `Deal`.
- **`NO_SLOTS` é derivado**, recalculado a cada leitura do perfil público.
  `PAUSED` tem precedência. Há teste que confirma que a coluna guardada
  continua a dizer `AVAILABLE` enquanto a API devolve `NO_SLOTS`.
- Interface: o criador abre e fecha vagas na agenda, e o comprador escolhe uma
  vaga concreta antes de contratar. O ecrã de marcação deixou de guardar uma
  preferência em `localStorage` e passou a criar o pedido.

### Uma decisão que vale a pena registar

**`acceptsNewDeals` deixou de exigir `AVAILABLE`.** Passou a recusar só
`PAUSED`. A razão é que `NO_SLOTS` é uma propriedade de uma *oferta de
marcação*, e antes desta mudança esgotar as vagas de uma oferta teria impedido
alguém de contratar outra — uma que nem vagas tem. Quem recusa por falta de
vaga é a janela, na transacção que cria o pedido.

### O que ficou de fora

**A vaga não é reservada ao escolher**, só ao contratar. Reservar na escolha
daria vagas presas por quem abriu o ecrã e nunca chegou a pagar, e obrigaria a
um prazo de expiração de reserva que o SDD não descreve. A consequência
assumida é que contratar pode falhar com 409 se alguém chegar primeiro — o ecrã
relê as vagas e diz o que sobrou.

**A vaga não volta em T15 nem T16.** Uma devolução depois de o criador ter
aceitado significa que o tempo foi reservado e, na prática, gasto. Quem decide
reabri-lo é o criador, abrindo outra janela.

Fica também de fora a **sincronização com calendário externo**, que está fora do
âmbito do produto, e a geração automática de janelas a partir dos dias e horas
de trabalho da agenda — hoje são duas coisas separadas, uma de intenção e outra
de compromisso.

### Dívida declarada por esta fatia

| Dívida | Porquê | Paga em |
|---|---|---|
| A agenda tem duas noções de disponibilidade: as preferências e as vagas | As preferências já existiam de F2 e servem outra coisa | Decisão de produto, quando houver uso real |
| Sem prazo de reserva ao escolher a vaga | Exigiria um mecanismo de expiração que o SDD não descreve | Se o 409 se mostrar frequente |
| `slotsPerDay` das preferências não gera vagas | Gerar janelas automaticamente é uma decisão de produto | — |

---

## F8 · Marcas e facturação

### Objectivo
Uma empresa contrata e recebe documento fiscal.

### O que fica feito
Conta `BRAND` com NIF e designação social, `Deal` ligado à conta, emissão de factura numerada em `PAID`, linhas, IVA, PDF guardado como `Media` `PROTECTED`, listagem para a conta destinatária.

### O que fica de fora
Nota de crédito e anulação — depende da resposta a DP-06.

### Migrações
| # | Nome | Conteúdo |
|---|---|---|
| 016 | `invoicing` | `invoices` com `UNIQUE(series, number)`, `invoice_lines`, sequência por série |

### Regras cobertas
RN-070, RN-071, RN-072, RN-073.

### Como se verifica
Cem facturas emitidas em paralelo produzem numeração sequencial sem lacunas e sem repetições. Uma falha na geração do PDF não consome número novo na segunda tentativa. Uma conta `BRAND` sem NIF não recebe factura e é notificada. Uma factura emitida não aceita alteração por nenhuma rota.

**Bloqueada por DP-06.** Não arranca antes de fechada.

---

## F9 · Notificações e tempo real

### Objectivo
As pessoas sabem o que se passa sem recarregar a página nem estar à espera.

### O que fica feito
`NotificationChannel` com implementação falsa e real para push, SMS e e-mail. Envio a partir de `outbox_events`, escrito na mesma transacção desde F1. Matriz de eventos do SDD §14.2, agrupamento, silêncio nocturno de Luanda, idempotência por evento e destinatário. Canal de tempo real por `Deal`, autorizado pelo mesmo guarda das rotas, com recuperação por cursor.

### O que fica de fora
Preferências finas de notificação por utilizador.

### Migrações
| # | Nome | Conteúdo |
|---|---|---|
| 017 | `notifications` | `notification_deliveries`, preferências mínimas |

### Regras cobertas
SDD §13 e §14 na íntegra.

### Como se verifica
Uma transacção revertida não envia notificação — teste que força a reversão depois de escrever no outbox. Duas execuções do mesmo evento enviam uma notificação. Uma mensagem enviada aparece no outro cliente sem recarregar. Um cliente que perde ligação recupera o histórico completo por cursor e não perde nenhuma mensagem. Um utilizador que não é parte do `Deal` não consegue subscrever o canal.

**Bloqueada por DP-02 e DP-03.**

---

## F10 · Operação

### Objectivo
A plataforma é observável e o dinheiro é reconciliável por uma pessoa.

### O que fica feito
Tarefa diária de reconciliação com os quatro cruzamentos do SDD §11.5, `reconciliation_findings`, alertas. Painel de administração: disputas, verificações, levantamentos, divergências, suspensão de conta. Registo estruturado com mascaramento, métricas de negócio, dinheiro, técnica e integridade. Auditoria consultável.

### Migrações
| # | Nome | Conteúdo |
|---|---|---|
| 018 | `reconciliation` | `reconciliation_findings` |

### Regras cobertas
SDD §15 na íntegra, RN-103 em verificação contínua.

### Como se verifica
Uma divergência injectada de propósito entre razão e `Wallet` é detectada no ciclo seguinte e gera alerta. Uma intenção presa em `PENDING` há mais de uma hora aparece na lista de divergências. Nenhuma linha de registo contém telefone completo, documento, destino de levantamento ou conteúdo de mensagem — teste que procura padrões sensíveis na saída de registo dos testes.

---

## O que F10 entregou, e o que não

**Feito e verificado**, contra Postgres real em `apps/api/test/ops.e2e-spec.ts`:

- **Reconciliação com seis cruzamentos** — os quatro do SDD §11.5 e mais dois
  que o sistema pode verificar sobre si próprio sem depender do parceiro: o
  razão que não fecha em zero (RN-100 em verificação contínua) e o escrow preso
  num negócio já fechado.
- **Nenhuma correcção é automática.** Há um teste que corrompe a carteira de
  propósito, corre a reconciliação, confirma que a divergência é detectada — e
  confirma que **a carteira continua errada**. Corrigir dinheiro sozinho é a
  maneira mais rápida de transformar uma divergência numa perda.
- **A mesma divergência não se regista a cada passagem**, por impressão digital
  `kind:subjectId` com único parcial enquanto estiver aberta. Uma intenção presa
  há uma semana dava sete linhas iguais e a lista deixava de se poder ler.
- **Fechar exige dizer o que se fez**, e distingue *resolvida* de *aceite* — uma
  divergência aceite sem nada mudar é um sinal sobre o sistema, não sobre aquele
  dia. O `CHECK` da migração garante que não se fecha pela metade.
- **Suspensão de conta** com motivo obrigatório e efeito imediato: a guarda de
  autenticação já recusava quem não está `ACTIVE`, e por isso não há sessão a
  expirar nem cache a invalidar. Ninguém se suspende a si próprio.
- **Auditoria consultável** por recurso, actor ou acção, e **métricas** de
  negócio, dinheiro, integridade e filas, com o dinheiro em string (RN-111).
- **Registo estruturado com mascaramento**, JSON por linha. O mascaramento
  acontece no `StructuredLogger`, por onde tudo passa, e não em cada chamada —
  confiar em que cada uma se lembre é garantir que uma se esquece, e basta uma
  para um documento de identidade ficar num ficheiro de texto.
- **Painel de operação** em `/admin`, que paga as dívidas de F5 e F6: as filas
  de disputas, levantamentos e identidades passam a ter um sítio.

### Uma correcção de fragilidade

A bateria ponta a ponta dependia de alguém se lembrar de passar
`DEAL_DEADLINE_SWEEP_MS=0`. Com a reconciliação a juntar-se aos prazos, isso
passou a ser dois agendadores a poder mexer em dados por baixo de uma
verificação. As duas variáveis passaram para `vitest.integration.config.ts`:
**ali quem manda no tempo é o teste**, e não a memória de quem corre os testes.

### O que ficou de fora

**O extracto do parceiro.** Dois dos quatro cruzamentos do SDD §11.5 — intenções
contra o estado real no parceiro, e capturas contra o extracto — só podem ser
feitos a sério quando DP-04 fechar. O que existe hoje verifica o sistema contra
si próprio: uma intenção presa há mais de uma hora e uma captura marcada sem o
lançamento que devia acompanhá-la. É menos do que o SDD pede, e é tudo o que se
pode fazer sem parceiro.

**Os alertas saem por `outbox_events`**, como tudo o resto, e ficam à espera de
F9 para chegarem a alguém. Até lá, a lista em `/admin` é o canal.

**A investigação registada de RN-064** continua por implementar: a administração
só abre uma conversa com disputa aberta. Fazer o outro caminho exigiria um
registo de investigação com dono e prazo, que é uma entidade nova.

### Dívida declarada por esta fatia

| Dívida | Porquê | Paga em |
|---|---|---|
| Sem cruzamento contra o parceiro | Não há parceiro | T-B, com DP-04 |
| Alertas ficam no outbox sem destinatário | Os canais são F9 | F9, com DP-02 e DP-03 |
| O painel não suspende contas pela interface | A rota existe e é a decisão mais perigosa do painel; merece um ecrã próprio | Quando houver uso real |
| Investigação registada de RN-064 | Entidade nova, sem procura que a justifique | Quando a administração precisar |

---

## O que F9 entregou — a metade que não depende de DP-02 nem de DP-03

F9 estava marcada como bloqueada, e metade dela não estava. **DP-02 bloqueia o
transporte de tempo real; DP-03 bloqueia os fornecedores de push, SMS e
e-mail.** Nenhuma das duas bloqueia o despacho — e desde F1 que cada transição
escrevia em `outbox_events` **na mesma transacção que muda o estado**, e nada
lia a tabela. Cada evento escrito desde então ficava por processar para sempre,
e a métrica `eventosPorProcessar` de F10 só crescia.

É exactamente o caso dos pagamentos: F1 construiu o ciclo completo atrás de
`PaymentsGateway` com só a implementação falsa, com DP-04 aberta. O mesmo
movimento aplica-se aqui.

**Feito e verificado**, contra Postgres real em `apps/api/test/notifications.e2e-spec.ts`:

- **Trabalhador do outbox** com retentativa e recuo exponencial (1 a 32
  minutos), um evento por transacção. Um que falhe não leva os outros atrás.
- **A matriz de eventos do SDD §14.2 como dados**, em `event-matrix.ts`. Quem é
  avisado de quê é decisão de produto: mudá-la deve ser editar uma linha, e ver
  a tabela deve chegar para responder à pergunta. Um evento fora da matriz não
  notifica ninguém — os de operação são para o painel, não para acordar um
  criador.
- **As regras de §14.3**: o SMS só para os três eventos que o justificam, e quem
  escreve uma mensagem não é avisado da sua própria mensagem.
- **Silêncio nocturno de Luanda**, 22h–07h, com dinheiro e disputa a
  atravessá-lo. **Silêncio é adiar, não descartar**: o que chega às 23h sai às
  7h. Luanda é UTC+1 o ano inteiro, sem horário de Verão, e por isso não foi
  preciso biblioteca de fusos nenhuma.
- **Idempotência por `(evento, destinatário, canal)`**, com chave única em
  `notification_deliveries` — e há teste que tenta inserir a chave repetida
  directamente pelo papel dono, para provar que a regra é do Postgres.
- **A gravação vem antes do envio**, de propósito. Entre gravar e enviar pode
  falhar tudo, e o pior que acontece é uma notificação perdida; pela ordem
  contrária, o pior era a mesma notificação duas vezes.
- Uma **conta suspensa não é notificada**: a plataforma fechou-lhe a porta, e
  continuar a escrever-lhe seria falar sozinha.

### A prova que interessa

O teste que justifica o desenho do outbox desde F1: **uma transacção revertida
não notifica ninguém**, porque o evento nunca chega a existir. Está nos dois
sítios — no caso de uso e contra Postgres.

### O que continua bloqueado

**DP-03 · os fornecedores.** Só existe `FakeNotificationChannel`, que grava numa
lista inspeccionável. `NOTIFICATIONS_PROVIDER=real` faz o arranque falhar com a
mensagem a dizer porquê. Quando DP-03 fechar, as implementações entram na
fábrica do módulo e **nem o planeador nem o trabalhador mudam**.

**DP-02 · o tempo real.** O canal por `Deal` com recuperação por cursor não foi
tocado — é transporte, e não há nenhum instalado. Até lá, sondagem periódica
serve, como o SDD já dizia.

Fica também de fora o **agrupamento de mensagens de conversa em janela de 5
minutos** (§14.3): exige guardar estado entre passagens do trabalhador, e sem
volume real não se sabe se a janela certa é de cinco minutos ou de trinta.

### Dívida declarada por esta fatia

| Dívida | Porquê | Paga em |
|---|---|---|
| Só o canal falso | Os fornecedores são DP-03 | Quando DP-03 fechar |
| Sem tempo real | O transporte é DP-02 | Quando DP-02 fechar |
| Sem agrupamento de mensagens | A janela certa não se adivinha sem volume | Quando houver uso real |
| Templates são identificadores, não textos | O texto depende do canal, e o canal é DP-03 | Com DP-03 |
| Sem preferências de notificação por utilizador | Já estava fora do âmbito de F9 no plano | — |

---

## Transversais

### T-A · Autenticação real
**Bloqueada por DP-01.** Substitui o adaptador provisório de F1 por trás da porta `AuthContext`. Verificação de telefone angolano no registo, sessão, renovação, segundo factor para administração. Nenhum caso de uso muda.
*Verifica-se:* o adaptador provisório é removido do código; arrancar em produção sem autenticação real falha; todos os testes de caso de uso continuam a passar sem alteração.

### T-B · Parceiro de pagamentos real
**Bloqueada por DP-04.** Implementa `PaymentsGateway` contra o parceiro, mantendo o falso para desenvolvimento e teste. Assinatura de webhook, formato de referência, devolução por API se existir, prazos de liquidação.
*Verifica-se:* o conjunto de testes de caso de uso passa sem alterações; um pagamento real em ambiente de testes do parceiro percorre o ciclo de F1 até `PAID`; uma assinatura de webhook inválida devolve 401.

---

## Decisões pendentes, por fatia bloqueada

| Decisão | Bloqueia | Precisa de resposta antes de |
|---|---|---|
| DP-01 Autenticação | T-A, e produção | Antes de qualquer exposição pública |
| DP-04 Parceiro de pagamentos | T-B | Antes de receber dinheiro real |
| DP-05 Contestação após aprovação | Parte de F6 | Início de F6 |
| DP-06 Requisitos AGT | F8 inteira | Início de F8 |
| DP-02, DP-03 Tempo real e notificações | F9 | Início de F9 |
| DP-08 Cancelamento por acordo | Parte de F4 | Início de F4 |
| DP-09 Recorrência de assinatura | Posts `MEMBERS` | Depois de F3 |
| DP-07 Comissão | Valores de F1 | F1 arranca com percentagem única configurável |
| DP-13 Armazenamento de objectos | F3 | Início de F3 |

As restantes — DP-10 a DP-14 — não bloqueiam nenhuma fatia do plano.

---

## Decisões tomadas durante a implementação de F1

Duas divergências entre o design e o SDD original foram encontradas, levadas a
decisão, e o design ganhou as duas. O SDD §5 e §11 ficam desactualizados nestes
dois pontos até serem reescritos.

### DP-15 · O comprador paga antes de o criador aceitar — **decidido**

O design mostra o pedido em "À espera" já com o valor retido, e a sequência é
briefing (P6) → pagamento (P7) → pedido criado (P8) à espera de aceitação. O SDD
tinha o contrário: aceitar, depois pagar.

**Implementado como o design.** O que mudou:

- `T1` cria o pedido em `PROPOSED` com o escrow em `PENDING`.
- `E1` (captura) retém o dinheiro **sem mexer no estado comercial** — o pedido
  continua em `PROPOSED`, à espera do criador. É a separação das duas máquinas
  de estado a ganhar o seu sustento: `PROPOSED` passa a ter duas caras, e é o
  escrow que as distingue.
- `T2` (aceitar) exige escrow em `HELD` e é o que arranca o prazo de entrega.
  Aceitar sem pagamento levanta `PaymentRequiredError`.
- `ACCEPTED` e `IN_PROGRESS` deixaram de ser dois passos: aceitar já é começar,
  porque não há acção nenhuma entre as duas. O "Em execução" do design é uma
  leitura do tempo decorrido contra o prazo, não um estado à parte.

*Fica em aberto para F4:* o prazo de resposta do criador agora expira com
dinheiro retido, e a devolução tem de ser automática. `T13` passa a ter de
lançar estorno.

### DP-07 · A taxa é 5% de cada lado — **decidido**

O design cobra a mesma percentagem às duas partes: no P7 o comprador paga 18 900
por uma oferta de 18 000, e no P16 o criador recebe 17 100 pela mesma oferta. A
NaDM fica com 10% do preço anunciado, metade de cada lado.

**Implementado como o design**, com `PLATFORM_FEE_BP=500`. O que mudou:

- `Deal.amount` passa a ser **o que o comprador paga** (preço + 5%), e não o
  preço anunciado.
- `Deal.creatorNet` é o preço − 5%. `Deal.platformFee` são as duas metades.
- **RN-042 sobreviveu sem alteração**, e com ela o `CHECK` da migração 003:
  `platformFee + creatorNet = (buyerFee + creatorFee) + (preço − creatorFee) = preço + buyerFee = amount`.
- O razão passou de três entradas a quatro: o criador é **creditado pelo preço e
  debitado pela sua metade da taxa**, em linhas separadas, porque é assim que a
  carteira do design mostra os movimentos. O líquido é o mesmo e a transacção
  continua a somar zero.

*Fica em aberto:* o design agrega a taxa por mês na carteira
(*"Taxa da NaDM · Setembro · 5% sobre 368 400 Kz"*). Está implementado por
pedido; a agregação mensal é apresentação e entra com F5.

**Também encontrado:** a migração 007 (ordem das mensagens), já registada acima.

## O que se faz a seguir

Implementar F1, e nada mais. A fatia está desenhada para caber numa iteração e para responder a uma pergunta: a entidade única aguenta o ciclo completo?

Se aguentar, o resto do plano é execução. Se não aguentar, descobre-se agora, com seis migrações e uma dúzia de casos de uso escritos, e não com metade do sistema construído por cima.
