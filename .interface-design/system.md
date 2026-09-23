# Sistema de interface da NaDM

Extraído de `design/Design de app personalizado (2)/NaDMScreen.dc.html` — a
pasta **(2)** é a actual disponibilizada neste projecto. Este ficheiro é o resumo operacional; o HTML do design
é a autoridade.

Referência revista em 22-09-2026: 37 ecrãs (P1–P37), com variantes claras,
escuras e estados interactivos. Não usar os mapas antigos de 24 ecrãs.

## Atenção: há dois sistemas na pasta do design

A pasta traz também `_ds/organic-…/`, um design system **Organic** — creme,
terracota, Caprasimo, cantos de 16px. **Não é o da aplicação.** Os ecrãs
(`NaDMScreen.dc.html`, `NaDM Mobile.dc.html`) trazem a sua própria folha de
tokens, e é essa que está implementada. Se alguém abrir o `_ds/` e começar a
usar `--color-accent`, está no sistema errado.

## Direcção

Verde-escuro de noite com um lime eléctrico. Mobile-first, tudo muito
arredondado, controlos a pílula, tipografia pesadíssima. É um produto de
telemóvel para pessoas ansiosas com dinheiro: o número é sempre grande, o estado
é sempre visível, e a cor de marca só aparece onde há boas notícias.

## Tokens

Em `apps/web/src/app/globals.css`, no bloco `@theme`.

| Token | Escuro | Claro |
|---|---|---|
| `--color-bg` | `#16281e` | `#eef2e6` |
| `--color-surface` | `#20372a` | `#ffffff` |
| `--color-surface2` | `#2b4736` | `#e2e8d6` |
| `--color-ink` | `#f6f8f3` | `#15261c` |
| `--color-dim` | `rgb(246 248 243 / .62)` | `rgb(21 38 28 / .7)` |
| `--color-line` | `rgb(246 248 243 / .14)` | `rgb(38 65 50 / .16)` |
| `--color-lime` | `#e1f83b` | `#cbe524` |
| `--color-lime-text` | `#e1f83b` | `#4a7a12` |
| `--color-lime-ink` | `#182a20` | `#15261c` |
| `--color-amber` | `#e6a24a` | `#9c5a18` |
| `--color-danger` | `#e2623c` | `#b13520` |
| `--color-wash` | `rgb(246 248 243 / .06)` | `rgb(38 65 50 / .045)` |

**O escuro é o modo de marca; a preferência inicial acompanha o sistema**, como na versão (2).
`ThemeProvider` guarda a preferência local; o editor de perfil também guarda o tema escolhido na API.

## Tipografia

Nunito, pesos 400–1000, via `next/font/google`.

| Uso | Peso | Tamanho |
|---|---|---|
| Número grande da carteira | 1000 | 40px, `tracking-[-0.045em]` |
| Valor no cartão do pedido | 1000 | 24px, `tracking-[-0.03em]` |
| Título de ecrã | 1000 | 21–24px, `tracking-[-0.035em]` |
| Título de cartão | 1000 | 15–17px |
| Nome, linha de lista | 900 | 13–14.5px |
| Corpo e bolhas | 700 | 12.5–13.5px, `leading-[1.45]` |
| Rótulo de secção (`.rotulo`) | 800 | 10px, versalete, `tracking-[0.14em]` |

**Tudo o que é dinheiro ou contagem leva `.algarismos`** (`tabular-nums`).

## Profundidade

Bordas e superfícies, sem sombras — excepto o cartão lime da carteira, que é o
único elemento elevado do produto (`shadow-[0_14px_34px_…lime 24%]`). Superfície
sobe por cor, não por sombra: `bg` → `surface` → `surface2`.

## Raios

Nada é quadrado. Bolhas 22px com um canto a 8px do lado de quem fala, cartões
24px, painéis 26px, destaque 30px, **controlos e pastilhas a 999px**.

## Componentes

| Onde | O que é |
|---|---|
| `components/ui.tsx` | `Pastilha`, `Botao`, `Capsula`, `Painel`, `Barra`, `Rotulo`, `Vazio` |
| `components/deal-card.tsx` | O cartão do pedido — dentro da conversa, nunca fora |
| `components/conversation.tsx` | Bolhas, carimbos de transição e divisor de dia |
| `components/flor.tsx` / `flor-defs.tsx` | A marca, também usada como filigrana e em estados vazios |
| `components/icon.tsx` | Ícones SVG partilhados, extraídos dos traços do mockup |
| `components/app-sheet.tsx` | Folha modal nativa: foco contido, Escape e botão de fechar |
| `components/bottom-nav.tsx` | Navegação contextual de criador/espectador, cápsula activa lime |
| `components/states.tsx` | `ACarregar` (três pontos), `AvisoSemSessao` |

## As três regras que não se negoceiam

**O cartão do pedido vive dentro da conversa.** Não é um painel lateral, não é
um separador. É a tese do produto desenhada: pedido, pagamento, conversa e
entrega são a mesma entidade.

**Ao lado do valor diz-se sempre onde o dinheiro está**, em palavras — *ainda
por pagar*, *retido na NaDM*, *retido até aprovares*, *libertado ao criador*,
*devolvido a ti*. Vem de `lib/deal-state.ts`. Um estado sem esta frase deixa de
responder à pergunta que as duas partes têm de facto.

**O lime é só para boas notícias.** Dinheiro seguro, acção primária, progresso.
O que está à espera é âmbar, o que correu mal é vermelho. Lime em tudo dilui a
única coisa que ele significa.

## Movimento

As **16 keyframes do design** estão portadas tal e qual, com as durações da sua
tabela de movimento — não aproximações:

| Uso | Duração | Classe |
|---|---|---|
| Toque de botão e de linha | 140ms | `.toque` |
| Entrada de cartões e blocos | 400ms | `.anima-sobe` |
| Folha inferior, sobe com mola | 340ms | `.anima-folha` |
| Carimbo de estado | 550ms | `.anima-carimbo` |
| Espera (flor a girar) | 2,4s em ciclo | `.anima-flor` |

Mais: `.anima-abre` (o desfoque a sair no desbloqueio — *"o momento que paga o
preço"*), `.anima-pulso` (o ponto de disponível), `.anima-conta` (números a
entrar de baixo), `.anima-barra` (prazo a crescer do zero), `.anima-glifo` (a
flor a saltar), `.anima-brilho` (esqueleto). Todas desligadas em
`prefers-reduced-motion`.

## Mapa de rotas

Nem todo ecrã corresponde a uma nova rota: estados de pagamento, folhas e
separadores pertencem à sua página. Existência da rota não equivale a integração
completa. Mapa verificado no código em 22-09-2026:

| Ecrã | Rota | Situação |
|---|---|---|
| P1 Perfil | `/{handle}` | Perfil, ofertas e avaliações via API; conteúdo depende de F3 |
| P2 Publicação | `/{handle}/p/[postId]` | Interface; serviço de conteúdo indisponível |
| P3 Playlist | `/{handle}/playlist/[playlistId]` | Interface; serviço de conteúdo indisponível |
| P4 DM | `/{handle}/dm` | Ofertas reais |
| P5 Conversa | `/deals/[id]` | API |
| P6 Briefing | `/{handle}/pedir/[offerId]` | API |
| P7 Express | `/deals/[id]/pagar` | API com gateway de desenvolvimento |
| P8 Estado | `/deals/[id]/estado` | API |
| P9 Entrega | `/deals/[id]/entrega` | API |
| P10 Avaliação/disputa | `/deals/[id]/avaliar` | Integração de interface por concluir |
| P11 Compras | `/meu`, `/deals` | Pedidos reais; biblioteca depende de conteúdo |
| P12 Painel | `/estudio` | Carteira, perfil e fila reais |
| P13 Caixa | `/estudio/caixa` | Pedidos reais, pesquisa e filtros |
| P14 Decidir pedido | `/estudio/pedidos/[id]` | Decisões suportadas pela API |
| P15 Publicar | `/estudio/publicar` | Rascunho local; serviço de conteúdo indisponível |
| P16 Ofertas | `/estudio/ofertas` | Edição, criação, pausa e arquivo via API |
| P17 Agenda | `/estudio/agenda` | Definições; não implica marcação/reserva real |
| P18 Carteira | `/wallet` | Saldos e movimentos reais; levantamento indisponível |
| P19 Números | `/estudio/numeros` | Agregados dos pedidos carregados, não analytics globais |
| P20 Centro de controlo | `/definicoes` → `/estudio/perfil?tab=…` | Perfil e definições via API |
| P21 Entrar | `/entrar` | Sessão de desenvolvimento; OAuth/SMS não ligados |
| P22 Criar perfil | `/criar-perfil` | Criação de conta de teste e perfil |
| P23 Entregar | `/deals/[id]/entregar` | API |
| P24 Marcar chamada | `/{handle}/marcar/[offerId]` | Interface; disponibilidade/reserva por integrar |
| P25 Início | `/inicio` | Pedidos e criadores reais; feed depende de F3 |
| P26 Descobrir | `/descobrir` | API de perfis, filtros na URL |
| P27 Avisos | `/notificacoes` | Derivados dos pedidos; leitura local |
| P28 Mensagens externas | Sem rota própria | SMS/WhatsApp/email não integrados |
| P29 Adesão | `/{handle}/membro` | Interface; cobrança recorrente não ligada |
| P30 Partilhar | `/{handle}/partilhar` | Link e QR reais |
| P31 Evento/criador | `/estudio/eventos` | Rascunho, não bilheteira real |
| P32 Bilhete | Por implementar | Não publicar QR de entrada fictício |
| P33 NaDM Pro | `/estudio/pro` | Apresentação; subscrição não ligada |
| P34 Marca | Por implementar | Workspace/campanhas sem implementação |
| P35 Denúncia/recurso | Por implementar | Moderação sem implementação |
| P36 Segurança | `/seguranca` | Sessão deste navegador; sem SMS/gestão remota |

| P37 Mimar | `/{handle}/mimar` | Selecção, mensagem, visibilidade e estimativa; sem cobrança |

## Entrada e navegação

`/` é um encaminhador: sem sessão → `/entrar`; com perfil e modo criador → `/estudio`;
em modo espectador → `/inicio`. Um visitante pode abrir directamente
`/{handle}` ou `/descobrir`.

A navegação inferior faz parte do mockup actual, com cápsula activa de 46×31px:

- Espectador: Início / Descobrir / DM / Meu.
- Criador, em todas as ferramentas: Painel / Caixa / Criar / Perfil público.
- Definições: pela engrenagem no painel/início → `/definicoes`, com 12 áreas.
- Empresa: previsto no design, ainda indisponível na aplicação.

Fluxos internos de pedido preservam voltar/acção principal e não acrescentam
uma barra sobre a conversa. O painel dá acesso às outras ferramentas pelo
grelha de seis atalhos “O teu estúdio”. Plano, segurança e conta ficam em Definições.

## Canvas e fidelidade

Coluna mobile com largura máxima de 390px, centrada no desktop, sem desenhar
o bezel, a barra de estado do telefone nem o indicador de gesto do catálogo.
Cabeçalhos, conteúdo rolável, acção inferior e navegação não se sobrepõem.

Dados, nomes, imagens e números do mockup são exemplos, não os dados do
utilizador. Estados vazios devem continuar vazios quando a API não tem conteúdo;
não adicionar seguidores, avaliações, receitas ou pagamentos fictícios.
Funcionalidade indisponível deve ser explicada, nunca simular cobrança ou
aprovação. Rascunho local deve dizer que ainda não foi publicado.

## Verificação reproduzível

`node scripts/visual-qa.mjs app /entrar 390 dark` captura a aplicação;
`node scripts/visual-qa.mjs reference p21 390 dark` renderiza a referência.
`node scripts/visual-qa.mjs flow /entrar 390 dark` verifica navegação sem
submeter alterações de perfil/oferta nem pedidos/pagamentos.
Imagens ficam em `/tmp/nadm-design-qa`; detalhes em `docs/frontend-visual-qa.md`.
