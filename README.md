# NaDM

Camada comercial da presença online de um criador. Mercado: Angola. Moeda: Kwanza.

**A regra central do produto é uma decisão de modelação:** pedido, pagamento,
conversa e entrega são a mesma entidade, `Deal`. Não são quatro tabelas ligadas
por referências.

## O que está construído

| Fatia | O que faz |
|---|---|
| **F1** | O ciclo completo: propor, pagar, aceitar, entregar, aprovar, libertar |
| **F2** | Perfil público, `handle`, catálogo de ofertas |
| **F3** | Media e conteúdo pago, com acesso decidido só por `ContentGrant` |
| **F4** | Caminhos de falha: recusa, contraproposta com acerto, prazos, devoluções |
| **F5** | Carteira, verificação de identidade e levantamentos |
| **F6** | Avaliações e disputas |
| **F7** | Disponibilidade, vagas e agendamento |
| **F9** | Despacho de notificações a partir do outbox |
| **F10** | Reconciliação, auditoria, métricas e painel de operação |

Por construir: **F8** (facturação), bloqueada pelos requisitos da AGT.

## Arrancar

```bash
npm install
npm run dev        # Postgres (5436), API (3333) e frontend (3001)
npm run dev:full   # o mesmo, e abre um túnel ngrok
```

## Testar

```bash
npm test                      # domínio e casos de uso, sem base de dados
npm run test:e2e -w apps/api  # contra Postgres real: restrições e concorrência
```

Os testes ponta a ponta verificam o que duplos não sabem — restrições `EXCLUDE`,
índices únicos parciais, revogação de escrita no razão e corridas de
concorrência.

## Estrutura

```
apps/api/   NestJS 11 · Prisma 6 (postgresql) · Zod 3 · Vitest 2
apps/web/   Next.js 15 App Router · React 19 · Tailwind 4 · Vitest 2
docs/       sdd.md (desenho) · plano.md (execução)
design/     os ecrãs, que são a autoridade visual
```

## O que ler antes de mexer

- **[CLAUDE.md](./CLAUDE.md)** — o que não se negoceia no código: as regras de
  dinheiro e de autorização, e as cinco decisões que obrigariam a reescrever o
  sistema se fossem revertidas.
- **[docs/sdd.md](./docs/sdd.md)** — o desenho: máquinas de estado, regras de
  negócio numeradas, modelo de dados, contratos de API.
- **[docs/plano.md](./docs/plano.md)** — o que cada fatia entregou, o que ficou
  de fora e porquê, e a dívida declarada de cada uma.

## Decisões por fechar

Nenhuma bloqueia o que já existe; todas bloqueiam produção ou a fatia que
nomeiam. Estão listadas no capítulo 18 do SDD — autenticação real (DP-01),
parceiro de pagamentos (DP-04), requisitos de facturação (DP-06), fornecedores
de notificação (DP-03), transporte de tempo real (DP-02) e cifra em repouso de
dados sensíveis (DP-17).

**A autenticação é provisória.** O `DevAuthGuard` identifica o utilizador por um
cabeçalho e **recusa arrancar com `NODE_ENV=production`**. Não removas essa
trava sem resolver DP-01.
