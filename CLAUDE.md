# NaDM

Camada comercial da presença online de um criador. Mercado: Angola. Moeda: Kwanza.

**A regra central do produto é uma decisão de modelação:** pedido, pagamento, conversa e entrega são a mesma entidade, `Deal`. Não são quatro tabelas ligadas por referências. Se uma alteração te levar a separá-las, pára e discute antes de escrever.

Desenho completo em [docs/sdd.md](docs/sdd.md). Plano de execução e ordem das fatias em [docs/plano.md](docs/plano.md). Este ficheiro é o que não se negoceia no código.

---

## Estrutura

```
apps/api/   NestJS 11 · Prisma 6 (postgresql) · Zod 3 · Vitest 2
apps/web/   Next.js 15 App Router · React 19 · Tailwind 4 · Vitest 2
docs/       sdd.md (desenho) · plano.md (execução)
design/     os ficheiros do Claude Design — a autoridade visual
.interface-design/system.md   os tokens e componentes extraídos do design
```

**Design:** os ecrãs estão em `design/Design de app personalizado (2)/NaDMScreen.dc.html`
— esta é a pasta actual fornecida pelo utilizador e presente no projecto, com 37 ecrãs (P1–P37).
A mesma pasta traz um design system `_ds/organic-…` que **não é o da aplicação** —
os tokens implementados são os da folha dos ecrãs (verde-escuro, lime, Nunito).
Ver `.interface-design/system.md` e `docs/design-v2.md` para o delta da versão (2).

**Arrancar:** na raiz, `npm run dev` prepara o Postgres (5436), gera o Prisma,
aplica migrações sem reset e inicia API (3333) e frontend (3001). Instâncias
saudáveis do NaDM são reutilizadas; processos de outros projetos não são mortos.
`npm run dev:full` faz o mesmo e abre/sincroniza ngrok sem palavra-passe. A porta 3000
fica para outro projecto. Ver `docs/desenvolvimento.md` para todos os comandos.

**Testar:** `npm test` corre os testes de domínio e de caso de uso, sem base de
dados. `npm run test:e2e` corre a verificação ponta a ponta contra Postgres real
— restrições, atomicidade e corridas de concorrência, que duplos não sabem.

**Dois papéis na base de dados.** `DATABASE_URL` é o papel da aplicação
(`nadm_app`), sem UPDATE nem DELETE no razão nem na auditoria.
`DIRECT_DATABASE_URL` é o papel dono e serve só para migrações — nunca para o
processo em execução.

A stack está fixada e inicializada. Não introduzas frameworks, ORMs, bibliotecas de validação ou runners de teste alternativos. Falta uma peça? Vai para decisões pendentes no SDD §18, não para o `package.json`.

## Convenções de código

**Identificadores, tabelas e rotas em inglês. Documentação e mensagens ao utilizador em português.**

### Camadas em `apps/api/src`

- `core/` — infra transversal, sem domínio: configuração validada por Zod, `PrismaService`, `TransactionRunner`, `Clock`, hierarquia `DomainError`, `DomainExceptionFilter`, `ZodValidationPipe`, guarda de autenticação.
- `shared/` — kernel partilhado: `Money`, `Handle`, portas que todos os módulos usam (`IdGenerator`, `OutboxRepository`, `AuditLogRepository`, `PricingPolicy`) e os duplos de teste em `shared/testing/`.
- `modules/<módulo>/` — um directório por módulo, com `domain/`, `application/{ports,use-cases}/`, `infra/`, `http/`. Hoje: `identity`, `profiles`, `deals`, `payments`, `ledger`.

### Regras de camada

1. **Um caso de uso é uma classe com um método `execute`.** Controladores validam, chamam e apresentam. Zero lógica de negócio em controladores.
2. **Casos de uso dependem de portas, nunca do Prisma.** `PrismaClient` só aparece dentro de `infra/`. Um `import` de `@prisma/client` em `application/` ou `domain/` é erro de revisão.
3. **O domínio não conhece HTTP.** Lança `ResourceNotFoundError`, `ResourceConflictError` ou `BusinessRuleError`; o filtro mapeia para 404, 409 e 422.
4. **Gateways externos têm sempre duas implementações**, real e falsa, escolhidas por variável de ambiente. Testes e desenvolvimento usam a falsa. Nenhum teste toca em rede.
5. **O relógio é injectado.** Nada chama `new Date()` dentro de domínio ou caso de uso, e nenhum teste de prazo espera tempo real.
6. **Nada lê `process.env` fora de `core/config/env.ts`.**
7. Entrada HTTP validada por Zod através do `ZodValidationPipe`. Sem validação manual espalhada.

### Dados

- Chaves `String @id @default(uuid()) @db.Uuid`. Nunca inteiros sequenciais em recurso exposto.
- Modelos em `PascalCase` singular, tabelas em `snake_case` plural via `@@map`.
- `createdAt`/`updatedAt` em tudo, `timestamptz`.
- Apagar conteúdo de utilizador é marcar `deletedAt`. **Registos de dinheiro nunca são apagados nem alterados.**
- Onde o Postgres garante melhor que a aplicação, a regra vai para o Postgres: restrições `CHECK`, índices únicos parciais, `EXCLUDE`. Verificação em aplicação perde a corrida sob concorrência.

### Testes

Vitest, ficheiro `.spec.ts` ao lado do ficheiro testado. **Todos os casos de uso são testados** — é requisito, não meta de cobertura.

Um teste que só verifica que um método foi chamado não prova nada. Cada caso de uso prova: o caminho normal com o estado e os valores resultantes, cada caminho de erro declarado com a classe de erro certa, os invariantes que lhe cabem, a idempotência onde existe, e a autorização quando é ele a decidi-la.

Restrições que só o Postgres garante testam-se contra Postgres real, em esquema descartável. Corridas de concorrência não se testam com duplos.

---

## Dinheiro — o que nunca pode ser violado

1. **Inteiros na menor unidade, com moeda explícita.** `BigInt` em cêntimos + `currency`. **Nunca vírgula flutuante, em nenhuma camada.** Um `Number`, um `parseFloat`, um `toFixed` sobre valor monetário é erro, mesmo em apresentação.
2. **No transporte, dinheiro vai como string de inteiro:** `{ "amount": "1500000", "currency": "AOA" }`. Número JSON é IEEE-754 e não representa `bigint` com segurança.
3. **O saldo é resultado de movimentos registados, nunca um campo actualizado.** `wallets` é projecção recalculável a partir de `ledger_entries`. Nenhum caso de uso escreve saldo directamente. Validação de saldo faz-se sobre o razão, nunca sobre a projecção.
4. **A soma algébrica das entradas de cada `LedgerTransaction` é exactamente zero.** Sem excepção.
5. **Entradas do razão não se alteram nem se apagam.** Corrigir é lançar estorno. `UPDATE` e `DELETE` estão revogados ao papel da aplicação na base de dados — não confies na disciplina, confia na permissão.
6. **`amountMinor > 0` em toda a entrada.** O sinal está em `direction`.
7. **Toda a operação que mexe em dinheiro é idempotente**, por `Idempotency-Key` na API, `providerEventId` único nos webhooks, e chave semântica no razão (`ledger:release:{dealId}`). Executar duas vezes produz um efeito.
8. **Toda a operação que mexe em dinheiro é auditável e reconciliável** com o parceiro de pagamentos. Escreve `audit_logs` e deixa rasto que permita cruzar com o extracto.
9. **Repartir um valor não perde cêntimos.** A soma das parcelas é exactamente o valor original; o resto vai para a primeira parcela.
10. **O escrow não se move por acção directa de um utilizador.** Move-se por consequência de uma transição do `Deal` ou de uma notificação do parceiro. Não existe rota que liberte dinheiro.
11. **Mudança de estado e lançamento no razão acontecem na mesma transacção de base de dados**, com o evento de notificação escrito em `outbox_events` lá dentro. Ou tudo, ou nada.

---

## Autorização — o que nunca pode ser violado

1. **Verificado no servidor, a cada pedido.** Nunca no cliente, nunca por campo vindo do corpo do pedido, nunca por filtragem só na interface.
2. **A pergunta é a relação com o recurso, não o papel.** *Este utilizador é parte deste `Deal`?* Papel só decide em `/admin/**`.
3. **Nenhum pedido, conversa, ficheiro ou movimento de carteira é acessível a quem não é parte dele.**
4. **Falhar um guarda de relação devolve 404, não 403.** Um 403 confirma que o recurso existe, e isso já é informação a mais sobre um `Deal` alheio. O 403 fica para os casos em que a existência não é segredo: identidade não verificada, conta suspensa.
5. **Nenhuma rota aceita um identificador de utilizador vindo do corpo do pedido para decidir de quem são os dados.** O utilizador vem do `AuthContext`.
6. **Conteúdo pago: acesso decidido exclusivamente por `ContentGrant`.** Nenhum caminho de leitura usa outro critério.
7. **`storageKey` nunca chega ao cliente.** Media protegida serve-se só por URL assinada de validade máxima de 15 minutos, emitida depois de verificar o acesso. Nada de conteúdo pago em armazenamento com leitura pública, nada de caminho adivinhável, nada de nome original no caminho.
8. **Acesso de administração a conversa ou a dados de identidade exige disputa aberta ou investigação registada**, e fica na auditoria.
9. **Toda a transição de estado tem dono declarado.** Se não sabes quem a pode accionar, não a implementes — está no SDD §5, com a tabela de transições e os prazos.

---

## O que exigir em cada revisão

### Bloqueadores — não passa sem isto

- [ ] Nenhum valor monetário passou por `Number`, `parseFloat`, `toFixed` ou aritmética de vírgula flutuante, incluindo na interface.
- [ ] Nenhum saldo foi escrito directamente; qualquer movimento de dinheiro passou pelo razão e a transacção soma zero.
- [ ] Operações de dinheiro são idempotentes, e há um teste que as executa duas vezes e verifica um único efeito.
- [ ] Mudança de estado, lançamento no razão e escrita no outbox estão na mesma transacção.
- [ ] Todo o acesso a recurso de outrem é verificado no servidor e devolve 404 quando não há relação, com teste que o prova.
- [ ] Nenhum `storageKey` aparece numa resposta da API.
- [ ] Todas as transições de estado usadas existem na tabela do SDD §5, com o dono certo.
- [ ] Cada caso de uso novo tem `.spec.ts` que cobre caminho normal, cada erro declarado, invariantes e autorização.
- [ ] Nenhum `import` de `@prisma/client` fora de `infra/`.
- [ ] Nenhum teste depende de rede ou de relógio real.

### Verificações de desenho

- [ ] A regra de negócio que estás a implementar tem número no SDD §7. Se não tem, ou é regra nova — e vai para o SDD primeiro — ou não devia estar a ser implementada.
- [ ] Preço de um `Deal` vem do `offerSnapshot`, não de um `join` a `offers`.
- [ ] Estado comercial e estado do dinheiro continuam separados. Um estado combinado do género `DELIVERED_BUT_NOT_PAID` é sinal de que o desenho se partiu.
- [ ] A transição escreveu uma `Message` de tipo `STATE_CHANGE` na conversa.
- [ ] O que acontece se o prazo expirar sem acção está implementado, não só o caminho feliz.
- [ ] A restrição pertence ao Postgres? Se protege contra concorrência, sim.

### Higiene

- [ ] Nada de `any` para contornar tipos de dinheiro ou de estado.
- [ ] Registo estruturado sem telefone completo, documento, destino de levantamento, token, assinatura de webhook ou conteúdo de mensagem.
- [ ] Migração corre de raiz numa base vazia.
- [ ] `npm test` verde nas duas apps.

---

## Fora de âmbito sem discussão prévia

Separar o `Deal` em entidades distintas. Tornar `wallets` fonte de verdade. Ler o preço pela oferta viva. Servir conteúdo pago por caminho directo. Juntar as duas máquinas de estado. Estas cinco são as decisões que, se forem revertidas, obrigam a reescrever o sistema — estão listadas no fim do SDD com o sinal de alarme de cada uma.

## Estado actual

O frontend está a ser alinhado com os **37 ecrãs** da pasta de design actual.
O mapa de rotas e as limitações de integração estão em `.interface-design/system.md`;
a verificação visual está em `docs/frontend-visual-qa.md`. Não assumir que uma
rota existente significa que todos os estados do protótipo têm backend.

A raiz encaminha visitantes para `/entrar`, criadores para `/estudio` e
espectadores para `/inicio`. O design actual inclui início (P25), descoberta
(P26) e navegação inferior contextual.

**`NaDM Mobile.dc.html` é o catálogo do design**, não uma página do produto.
O menu do catálogo não deve ser copiado para a aplicação; a barra inferior
dos próprios ecrãs deve ser.

**Três decisões tomadas contra o SDD original — o design ganhou as três, e o
SDD já está reescrito em conformidade** (§5, §6, §9, §11 e §18). O registo de
cada uma, com o que se ponderou, está em `docs/plano.md`.

1. **Paga-se antes de o criador aceitar** (DP-15). A captura retém o dinheiro
   **sem mudar o estado comercial**: `PROPOSED` tem duas caras, por pagar e pago
   à espera do criador, e é o escrow que as distingue. Aceitar exige `HELD` e é
   o que arranca o prazo de entrega.
2. **A taxa é 5% de cada lado** (DP-07). `Deal.amount` é o que o comprador paga
   (preço + 5%), não o preço anunciado. O criador recebe preço − 5%. RN-042
   sobreviveu sem alteração. No razão, o criador é creditado pelo preço e
   debitado pela taxa em linhas separadas — quatro entradas, não três.
3. **A contraproposta acerta o escrow** (DP-16). Ver a secção de estado actual.

**Autenticação não existe.** Nenhum pacote instalado, DP-01 em aberto. O
`DevAuthGuard` identifica o utilizador pelo cabeçalho `X-Dev-User` e **lança no
construtor** com `NODE_ENV=production`. Não construas nada que dependa de um
mecanismo de autenticação concreto, e não removas essa trava sem T-A.

**F4 fechou os caminhos de falha.** Recusa (T3), rejeição de entrega com
revisões (T11), expiração da proposta com estorno (T13), aprovação automática
(T10) e devolução por atraso (T16) estão implementadas, com E3 e E4 no escrow e
um agendador sobre o relógio injectado. A verificação está em
`apps/api/test/deal-failure-paths.e2e-spec.ts`.

**A contraproposta tem acerto de escrow (DP-16).** T4, T5 e T6 estão feitas. Um
`Deal` em `PROPOSED` com escrow `HELD` tem no escrow **exactamente
`deal.amount`** — é esse invariante que torna aceitar seguro, e é ele que o
acerto protege. Preço a subir: o comprador reforça, e **é a captura do reforço
que dispara T5** (`PaymentIntent` com `purpose = TOP_UP`), mantendo a ordem de
DP-15. Preço a descer: estorno parcial na mesma transacção. Só o prazo a mudar:
nada se move.

`DealsRepository.saveRenegotiated` é a **única** escrita que altera os valores
de um `Deal` depois de criado, e está separada de `save` de propósito. Se
precisares de mudar preço fora de T5, pára — RN-041 diz que não.

A interface da contraproposta é o P14 e pertence a F8; o P23, do fã, não tem
contraproposta nenhuma. Disputas (T15) e cancelamento por acordo continuam em
F6 e DP-08.

A tabela `DEAL_TRANSITIONS` em `modules/deals/domain/deal-status.ts` continua a
ser a lista do que existe e do que falta — acrescenta lá antes de implementar.

**F5 pôs o dinheiro a sair da plataforma.** Verificação de identidade submetida
pelo criador e decidida pela administração, e levantamentos com reserva
imediata, aprovação, confirmação, falha com estorno e cancelamento. A
verificação está em `apps/api/test/payouts.e2e-spec.ts`.

Quatro coisas de F5 que não se negoceiam:

1. **O saldo lê-se do razão, nunca da carteira** (RN-050). `wallets` é
   projecção; há um teste que a corrompe de propósito e confirma que o
   levantamento continua a ser recusado.
2. **`LedgerRepository.balanceOf` é a soma algébrica — débitos menos créditos**,
   a mesma convenção de `LedgerEntry.signedAmount`. Numa conta de passivo isso
   é negativo quando há dívida. Para saber quanto se deve a alguém usa-se
   `amountOwed`, e a inversão de sinal vive **só lá**. As duas implementações
   divergiam neste ponto até F5 — foi um defeito real, não uma subtileza.
3. **Aprovar uma `IdentityVerification` é a única coisa que eleva
   `verificationLevel`.** Nunca um campo do corpo do pedido.
4. **`RolesGuard` é o único sítio onde o papel decide o acesso**, e só em
   `/admin/**`. Devolve 403, não 404: ali a existência do recurso não é segredo.

**Dados sensíveis estão em claro na base de dados** — `payouts.destination` e
`identity_verifications.document_number`. Não saem da API nem do registo, e há
teste que o prova, mas um acesso directo à base lê-os. É **DP-17**, bloqueia
produção e não bloqueia nenhuma fatia. Não inventes cifra; a stack não tem
biblioteca para isso e a decisão não é de implementação.

A ordem ao parceiro de pagamentos é dada e confirmada por uma pessoa, em rotas
de administração. Quando DP-04 fechar, `markProcessing` e `settle` passam a ser
accionadas pela notificação do parceiro e **nenhum caso de uso muda**.

**F6 deu ao sistema uma saída para o desacordo.** Disputa aberta por qualquer
das partes, decisão da administração com T15, avaliação com resposta única do
criador e média no perfil. A verificação está em
`apps/api/test/disputes.e2e-spec.ts`.

Três coisas de F6 que não se negoceiam:

1. **Disputa aberta trava a libertação** (RN-048), e a verificação corre
   **dentro da transacção** da aprovação. Fora dela, uma disputa aberta entre a
   leitura e o lançamento passaria despercebida.
2. **A administração só entra numa conversa com disputa aberta**, e a auditoria
   é escrita **antes** de o conteúdo ser devolvido (RN-064). As mensagens dela
   são `SYSTEM` com `senderUserId` a `null` — quem fala é a NaDM, não a pessoa.
3. **A média das avaliações é um inteiro em décimas**, não um `float`. 47 é 4,7.
   O mesmo princípio do dinheiro, pela mesma razão: comparar valores que
   arredondam de maneiras diferentes não serve.

`APPROVED` continua definitivo — a janela de contestação é DP-05 e não foi
decidida. Não a implementes sem ela: obrigaria a recuperar dinheiro já
libertado, e esse mecanismo não existe.

**F7 trouxe as vagas.** `AvailabilityWindow` por oferta `BOOKING`, consumo na
transacção que cria o `Deal` e devolução quando o pedido morre antes de haver
trabalho. A verificação está em `apps/api/test/availability.e2e-spec.ts`.

Duas coisas de F7 que não se negoceiam:

1. **A vaga toma-se com um `UPDATE` condicionado**, não com um `SELECT` seguido
   de escrita: `SET slots_taken = slots_taken + 1 WHERE slots_taken <
   slots_total`. Se o vires a virar leitura-e-depois-escrita, pára — é a corrida
   pela última vaga a ser reaberta.
2. **`NO_SLOTS` nunca é escrito.** Deriva das janelas a cada leitura, com
   `PAUSED` a ganhar. Guardá-lo criaria uma segunda verdade sobre a mesma coisa,
   e as duas haviam de divergir.

A não sobreposição de janelas (RN-033) é uma restrição `EXCLUDE` com
`btree_gist`, e há teste que insere directamente pelo papel dono para provar que
a regra não está no caso de uso.

**F10 tornou o sistema observável.** Reconciliação com seis cruzamentos,
suspensão de conta, auditoria consultável, métricas e registo estruturado com
mascaramento. O painel está em `/admin`. A verificação está em
`apps/api/test/ops.e2e-spec.ts`.

Três coisas de F10 que não se negoceiam:

1. **A reconciliação não corrige nada.** Detecta, regista e alerta; quem decide
   é uma pessoa, com registo de auditoria (SDD §11.5). Há um teste que corrompe
   a carteira, confirma a detecção e confirma que **a carteira continua
   errada**. Se alguma vez lhe acrescentares uma correcção automática, pára.
2. **O mascaramento vive no `StructuredLogger`**, por onde tudo passa, e não em
   cada chamada. `core/logging/redact.ts` tem a lista do que nunca sai:
   telefone completo, documento, destino de levantamento, token, assinatura e
   conteúdo de mensagem (SDD §15.1).
3. **Fechar uma divergência exige dizer o que se fez**, e *resolvida* não é o
   mesmo que *aceite*. O `CHECK` da migração 019 garante que não se fecha pela
   metade.

**O outbox passou a ser consumido.** Desde F1 que cada transição escrevia em
`outbox_events` na mesma transacção que muda o estado, e **nada lia a tabela**.
F9 trouxe o trabalhador, a matriz de eventos do SDD §14.2 como dados, as regras
de §14.3 e a idempotência. A verificação está em
`apps/api/test/notifications.e2e-spec.ts`.

Três coisas de F9 que não se negoceiam:

1. **A gravação da entrega vem antes do envio.** Entre as duas pode falhar
   tudo: perder uma notificação é recuperável por quem abre a aplicação,
   duplicá-la não se desfaz. Se inverteres a ordem, pára.
2. **Silêncio nocturno é adiar, não descartar** — o que chega às 23h sai às 7h.
   Luanda é UTC+1 o ano inteiro, e por isso não há biblioteca de fusos.
3. **Quem é avisado de quê vive em `event-matrix.ts`**, como dados. É decisão de
   produto: não a espalhes por `if`s.

**Só existe `FakeNotificationChannel` (DP-03)**, e `NOTIFICATIONS_PROVIDER=real`
faz o arranque falhar. O tempo real (DP-02) não foi tocado.

Os agendadores — prazos, reconciliação e despacho — estão **desligados na
bateria e2e** por `vitest.integration.config.ts`. Ali quem manda no tempo é o
teste.

**F3 passou a estar ligada.** O módulo de conteúdo existia escrito e
**inalcançável**: sem controlador, sem registo em `app.module.ts` e sem um único
teste. Está ligado, testado, e com a compra de conteúdo a funcionar.

Três coisas de F3 que não se negoceiam:

1. **O `storageKey` nunca sai.** Há um teste ponta a ponta que percorre o corpo
   das respostas da API à procura do valor real, lido da base de dados. Se
   acrescentares um campo a uma resposta de media, ele apanha-te.
2. **Comprar conteúdo é um `Deal` como qualquer outro** — escrow, razão e
   conversa. Publicar conteúdo pago cria a oferta `CONTENT_UNLOCK` com o preço
   da publicação; o criador põe o preço uma vez.
3. **O desbloqueio corre na transacção da captura.** T2, T8, T9 e T12 de uma
   vez, com o `ContentGrant` lá dentro: ou o comprador fica com o acesso e o
   criador com o dinheiro, ou não acontece nada.

`EscrowReleaseService` é agora o **único** sítio que liberta escrow, e tem dois
chamadores: a aprovação de uma entrega e o desbloqueio de conteúdo. Não faças
uma segunda cópia.

`@OptionalUser()` é para rotas **públicas que mostram mais a quem tem sessão**.
`@CurrentUser()` continua a recusar quem não tem — é essa a diferença, e não são
intermutáveis.

**O frontend do conteúdo está ligado.** O catálogo do criador vive em
`/profiles/me/content`, como as ofertas; o do visitante em
`/profiles/:handle/content`. Publicar conteúdo pago funciona nos dois lados, e o
botão de desbloquear cria o `Deal` e segue para o pagamento — o acesso é
concedido pela captura, nunca pelo ecrã.

`src/lib/simulado.ts` **já não é importado por ecrã nenhum**. O próprio ficheiro
diz que a lista de imports é a lista do que falta ligar: está vazia, e o ficheiro
pode ser apagado.
