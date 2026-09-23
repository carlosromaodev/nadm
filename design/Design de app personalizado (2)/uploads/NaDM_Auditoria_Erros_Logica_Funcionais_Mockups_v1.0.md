# NaDM — Auditoria de Erros de Lógica e Funcionais dos Mockups

**Versão:** 1.0  
**Escopo analisado:** mockups P1–P30 do pacote `Design de app personalizado.zip`  
**Fontes principais:** `NaDM Mobile.dc.html` e `NaDMScreen.dc.html`  
**Objetivo:** identificar erros de lógica, funcionais, financeiros, de estado, navegação, segurança e lacunas operacionais antes do desenvolvimento.

> **Decisão de escopo:** esta auditoria **não recomenda reduzir a NaDM**. Quando um fluxo está incompleto, a correção proposta é completar a função, não removê-la.

## 1. Como ler esta auditoria

- **BLOCKER** — pode causar dinheiro errado, acesso indevido, estado impossível, perda de dados ou impedir um fluxo central.
- **CRITICAL** — quebra uma função importante ou contradiz uma regra central do produto.
- **HIGH** — problema relevante que deve ser corrigido antes de produção.
- **MEDIUM** — falha de consistência, UX, manutenção ou caso secundário.
- **Confirmado no código** significa que o comportamento foi identificado nos handlers/variants do protótipo.
- **Lacuna** significa que uma capacidade necessária não está representada nos P1–P30.

### Resumo quantitativo

**Total de problemas registados: 293**

| Severidade | Quantidade |
|---|---:|
| BLOCKER | 27 |
| CRITICAL | 53 |
| HIGH | 151 |
| MEDIUM | 62 |

## 2. Bloqueadores que impedem começar a implementação sem correção de especificação

1. Formalizar **Free vs NaDM Pro**, incluindo entitlement de preço personalizado.
2. Corrigir **payment state machine**: nenhum clique do utilizador pode confirmar pagamento sem PSP.
3. Separar o comportamento financeiro de **conteúdo, serviço, evento, tip e membership**.
4. Corrigir os fluxos quebrados de **P3, P7, P9, P21, P24 e P30**.
5. Definir **Order + Payment + Ledger + Refund + Payout** como fontes de verdade.
6. Criar o módulo completo de **Eventos**, que hoje não existe nos P1–P30.
7. Criar **NaDM Pro**, hoje ausente apesar de ser parte do modelo de negócio.
8. Criar **Backoffice/Admin** para KYC, fraude, disputas, refunds, payouts e moderação.
9. Criar o lado completo de **Marcas/Business**, e não apenas a receção de uma proposta.
10. Definir **roles/capabilities** para impedir vazamento de modo comprador ↔ criador.

## 3. Inconsistências financeiras já visíveis nos mockups

| Item | Valor/Regra A | Valor/Regra B | Problema |
|---|---:|---:|---|
| Resposta em vídeo | 18.000 Kz | comprador paga 18.900 Kz | fee do comprador não está formalizada |
| Resposta em vídeo | creator recebe 17.100 Kz | preço 18.000 Kz | fee do creator de 5% também é aplicada |
| Campanha Óptica Kilamba | 350.000 Kz em P14 | 35.000 Kz em P18 | diferença de um zero |
| Chamada 15 min | 45.000 Kz em P4/P24 | 19.000 Kz em P18 | valores incompatíveis |
| Taxa NaDM | 5% em P15/P16/P18/P28 | buyer também paga +5% em P6/P7 | take total fica ambíguo |
| Wallet vs Analytics | P18 usa disponível/retido/fee | P19 usa receita sem definição gross/net | reconciliação não é verificável |

## 4. Erros confirmados de roteamento / handlers

| Código/área | Comportamento atual | Consequência |
|---|---|---|
| `sheetAvancar` | qualquer oferta P4 → P6 `teclado` | mensagem grátis, call, tip e serviço entram no briefing errado |
| `p6Avancar` | qualquer estado → P7 | briefing incompleto pode avançar |
| `p7Avancar` | qualquer estado → P8 `espera` | falha/expiração/sem rede podem parecer pagamento válido |
| `p8Ir` | recusado/expirado → P5 `devolvido` | CTA não leva ao destino prometido |
| `p9Aprovar` | qualquer estado não aprovado → aprovado | 'Ver conversa' pode aprovar/libertar dinheiro |
| `p10Avancar` | `poravaliar` → `avaliado` | review pode avançar sem rating |
| `p14Ir` | qualquer pós-estado → P13 | 'Abrir trabalho'/'Ver conversa' não abre o recurso |
| `p15Avancar` | `carregar` → `publicado` | publicação pode terminar antes do upload |
| `p15Avancar` | `pasta` → `pasta` | loop na criação de pasta |
| `p16Avancar` | qualquer estado → P4 | ações de pausa/reativação não persistem |
| `p18Avancar` | `dados` → `saldo`; restantes → `caminho` | payout method/estados não são realmente processados |
| `p21Avancar` | tudo exceto `numero` → P22 | OTP não validado pode avançar |
| `p23Avancar` | `carregar` → `entregue` | entrega pode concluir sem upload confirmado |
| `p24Avancar` | escolhido → P7 hardcoded | call de 45k entra no checkout de outro produto |
| `p27Limpar` | → `vazio` | marcar lidas apaga visualmente todo histórico |
| `p29Gestao` | todos → P28 email | switches de assinatura abrem recibo |
| `p30Qr` | matriz fixa 11×11 | não é QR funcional |

## 5. Inventário de controlos visualmente ativos mas sem função

Os seguintes grupos usam handlers vazios ou não possuem seleção funcional no protótipo:

- P15: pastas, visibilidade da pasta, preços, etiquetas, comentários, reações, avisos, offline e agendamento.
- P16: preços, apoio extra, +/- prazo, +/- vagas, +/- alterações, direitos de uso, regras e política de cancelamento.
- P17: edição real de dias/horários/capacidade.
- P20: vários settings, switches e ações destrutivas.
- P22: várias escolhas de onboarding, fontes de foto e avisos.
- P24: dias e horários de chamada.
- P10: seleção de rating.

---

## Sistémicos / transversais

| ID | Severidade | Tipo | Evidência | Erro | Impacto | Correção necessária |
|---|---|---|---|---|---|---|
| SYS-001 | BLOCKER | Lógica/UX | NaDMScreen.dc.html ~4110–4125 | A navegação inferior muda de significado e de destinos conforme o ecrã. | O utilizador perde memória espacial; o mesmo lugar da barra pode significar Caixa, Ofertas, Números, Descobrir ou Meu. | Definir shells de navegação estáveis por contexto e nunca trocar a semântica da mesma posição durante o fluxo. |
| SYS-002 | CRITICAL | Autorização/UX | Barra inferior de P27 e rotas de P11 | Há vazamento de contexto entre comprador e criador. P27 usa a barra de criador mesmo quando é aberto pela home do comprador; em P11, 'Perfil' pode abrir P1 em modo proprietário. | Um comprador pode cair visualmente em ferramentas de criador ou ver um perfil no estado errado. | Derivar navegação e permissões do papel/contexto autenticado, não apenas do ecrã atual. |
| SYS-003 | BLOCKER | Modelo de negócio | P15/P16 vs regra canónica NaDM | O protótipo permite preços personalizados sem qualquer bloqueio de NaDM Pro. | Contradiz a monetização definida: Free usa preço padrão; custom pricing é benefício Pro. | Criar entitlement CUSTOM_PRICING e gate visual/backend em todos os pontos de edição de preço. |
| SYS-004 | CRITICAL | Funcional | Artefactos P1–P30 | Não existe fluxo completo de assinatura NaDM Pro para o criador. | Não há upgrade, pagamento, renovação, expiração, cancelamento nem estado de entitlement do plano. | Adicionar módulo NaDM Pro separado das memberships de fãs. |
| SYS-005 | BLOCKER | Financeiro | P2/P3/P4/P5/P6/P7/P18/P29 | O conceito 'dinheiro retido na NaDM' é aplicado quase como regra universal a tipos de compra diferentes. | Conteúdo digital, serviço, evento, tip e membership possuem necessidades financeiras diferentes; um único escrow gera estados incorretos e risco regulatório. | Criar state machines financeiras específicas por produto: instant digital, service hold, event ticket, recurring membership e tip. |
| SYS-006 | BLOCKER | Financeiro | P6/P7/P15/P16/P18/P23/P28 | Taxas não possuem uma definição única: há +5% cobrado ao comprador e -5% ao criador em vários exemplos. | A plataforma pode aparentar cobrar 10% no total sem explicar; valores líquidos/brutos tornam-se inconsistentes. | Definir fee model canónico, nomes de cada fee, base de cálculo e quem paga cada uma. |
| SYS-007 | CRITICAL | Financeiro | Diversos ecrãs | Preços, taxas, saldos e valores estão hardcoded na interface. | Alterações comerciais ou por categoria exigiriam editar frontend e podem divergir do backend. | Todos os valores financeiros devem vir de quote/order snapshots calculados no backend. |
| SYS-008 | BLOCKER | Pagamentos | P7 | O fluxo permite avançar após o utilizador dizer que confirmou no Express, sem prova de confirmação do provider. | Pode criar pedido pago sem pagamento real. | Order só pode ir para PAID após webhook/polling assinado do PSP e verificação idempotente. |
| SYS-009 | BLOCKER | Pagamentos | Mockups não definem | Não existe regra de idempotência para cobrança, refund, payout e criação de order. | Duplo toque, retry ou webhook repetido pode duplicar dinheiro/pedidos. | Exigir Idempotency-Key, unique providerReference e processamento idempotente. |
| SYS-010 | BLOCKER | Pagamentos | Mockups não definem | Não existe reconciliação entre PSP, Payment, Order, Wallet e payout. | Diferenças de estado podem criar saldos incorretos e disputas financeiras. | Adicionar reconciliation jobs, ledger imutável e alertas de inconsistência. |
| SYS-011 | CRITICAL | Compliance | P5/P6/P18 | A linguagem sugere que a NaDM guarda dinheiro diretamente, mas o modelo legal/custódia não está definido. | Pode criar expectativa de carteira/custódia financeira sem enquadramento regulatório. | Modelar a NaDM como orquestradora sobre parceiros autorizados e adaptar copy ao mecanismo real. |
| SYS-012 | CRITICAL | Funcional | Escopo de produto | Eventos são parte nuclear da NaDM, mas não existe módulo completo de eventos nos P1–P30. | Faltam criação, página pública, tipos de bilhete, checkout, QR válido, participantes, check-in, lotação, cancelamento e reagendamento. | Adicionar fluxo integral de Eventos sem retirar nenhuma das funções atuais. |
| SYS-013 | CRITICAL | Funcional | P14 e restantes ecrãs | A marca/empresa só aparece como remetente de proposta; não existe produto completo do lado da empresa. | Faltam conta Business, pesquisa de criadores, criação de campanha, shortlist, approvals, equipa, invoices e reporting. | Criar Brand/Business Workspace próprio. |
| SYS-014 | BLOCKER | Operações | Ausente | Não existe Backoffice NaDM. | Disputas, KYC, fraude, refunds, payouts, denúncias e reconciliação não podem ser operados. | Criar Admin/Operations Console antes de dinheiro real. |
| SYS-015 | CRITICAL | Trust & Safety | Ausente | Não existe fluxo completo de denunciar perfil/post/mensagem, bloquear, moderar e recorrer. | Uma plataforma de DMs pagas é especialmente exposta a spam, assédio, fraude e conteúdo proibido. | Adicionar report/block/moderation queue, reason codes, evidence e appeal. |
| SYS-016 | CRITICAL | KYC | P22 | KYC só tem praticamente 'enviado/em análise/confirmado'; faltam exceções. | Sem estados de documento inválido, selfie falhada, divergência de nome, documento expirado e reenvio. | Criar state machine KYC completa e gating de payouts/aceitação conforme risco. |
| SYS-017 | HIGH | Auth/Security | P21 | Não estão desenhados recuperação de conta, troca/perda de telefone, gestão de sessões, dispositivos, revogação e MFA. | Conta de criador com saldo pode ser tomada sem fluxo de recuperação robusto. | Adicionar security center e recovery flows. |
| SYS-018 | HIGH | Responsividade | NaDM Mobile.dc.html e NaDMScreen.dc.html | A experiência é desenhada essencialmente em viewport fixo ~390×844/412×866. | Não há especificação real para 320/360px, tablets, desktop, landscape, safe areas e teclado. | Definir comportamento responsivo por componente e layouts adaptativos. |
| SYS-019 | HIGH | Acessibilidade | Sistema visual | Há microtexto recorrente na faixa de ~9–11,5 px e muitos controlos icon-only. | Leitura, toque e uso com tecnologias assistivas podem falhar. | Definir mínimo tipográfico, touch targets, aria-labels, foco visível, contraste e reduced motion. |
| SYS-020 | HIGH | Funcional | Código dos mockups | Muitos elementos visualmente interativos usam handlers vazios `() => {}`. | O protótipo comunica capacidades que não funcionam nem possuem transição. | Inventariar cada controlo e exigir handler/state/API ou marcar explicitamente como não-interativo. |
| SYS-021 | CRITICAL | Funcional | P6/P7/P10/P15/P18/P23 | Vários botões com aparência disabled continuam com onClick ativo. | Utilizador consegue avançar sem dados, publicar antes do upload, avaliar sem nota ou iniciar levantamento inválido. | O estado disabled deve remover ação no DOM e ser validado novamente no backend. |
| SYS-022 | HIGH | Arquitetura | Todos os ecrãs | Estados de negócio são simulados por `screen + variant` em vez de derivados de entidades e state machines. | É possível navegar para estados impossíveis ou contraditórios. | Separar UI state de domain state; Order/Payment/KYC/Subscription devem possuir transições válidas explícitas. |
| SYS-023 | HIGH | Arquitetura | Todos os mockups | Perfis, orders, mensagens e resultados usam dados/rotas estáticas em vez de IDs reais. | Diferentes pessoas podem abrir o mesmo perfil/conversa de demonstração. | Todas as rotas devem carregar recursos por identificador e validar ownership/permission. |
| SYS-024 | HIGH | Media | P2/P3/P15/P23 | Não há política completa de tamanho, formato, transcode, retry/resume, falha de upload e scan. | Vídeo é caro e falhas de rede móvel são comuns. | Definir Media pipeline, signed upload, progress, retry, transcoding e validation. |
| SYS-025 | HIGH | Entitlements | P2/P3/P11/P29 | Direito de acesso a conteúdo não está formalizado. | Conteúdo comprado 'para sempre', membership temporária e offline podem conflitar. | Criar entitlement model com source, start/end, revocation e permanentPurchase. |
| SYS-026 | HIGH | DM/Abuse | P4/P5/P13 | Não existe desenho de rate limit, spam, flood, anexos maliciosos e abuso de mensagem grátis. | O custo de moderação e assédio pode crescer rapidamente. | Adicionar limites, cooldowns, block/report, reputation e anti-abuse. |
| SYS-027 | MEDIUM | Notificações | P27/P28 | Existe preview de canais, mas não um centro consistente de preferências por categoria/canal. | Utilizador não controla push/SMS/email de forma previsível. | Criar notification preferences matrix com mandatory security notices separados. |
| SYS-028 | HIGH | Analytics/Privacidade | P30/P19 | Atribuição de visitas/conversões é mostrada sem definir tracking, janela de atribuição e consentimento. | Métricas podem ser incorretas e criar problemas de privacidade. | Definir event schema, attribution rules, consent e anonimização. |
| SYS-029 | HIGH | Privacidade | P20 | Existe opção de mostrar quem comprou sem uma política explícita de consentimento. | Pode expor clientes/fãs e gerar risco reputacional. | Default privado; qualquer prova social deve ser opt-in e granular. |
| SYS-030 | HIGH | Produto | P29 vs NaDM Pro | Membership do fã e plano NaDM Pro do criador não estão suficientemente separados no UX. | Usuários e equipa podem confundir assinatura de creator com assinatura da plataforma. | Usar entidades, naming, billing e ecrãs separados. |
| SYS-031 | MEDIUM | Membership | P29 | Mockup usa um único membership de 9.000 Kz, enquanto a visão de produto prevê níveis/tiers. | Benefícios e segmentação ficam limitados. | Implementar MembershipTier e deixar creator definir tiers conforme regras do plano. |
| SYS-032 | CRITICAL | Billing | P29 | Renovação automática é assumida sem validar se o método de pagamento suporta recurring debit. | A assinatura pode prometer comportamento tecnicamente impossível com o PSP escolhido. | Só mostrar auto-renew quando provider e mandato recorrente suportarem; caso contrário usar renewal request. |
| SYS-033 | HIGH | Financeiro | Todo o produto | Não existe matriz única de cancelamento/refund por INTERACTION, SERVICE, CONTENT, EVENT, MEMBERSHIP e TIP. | As mesmas regras podem ser aplicadas a produtos incompatíveis. | Criar RefundPolicy por productType + order state. |
| SYS-034 | HIGH | Financeiro | P10 | Não existem partial refund, chargeback, reversal e payout clawback. | Disputas reais raramente são apenas refund total ou regravação. | Adicionar estados e ledger entries para partial/refund/reversal/chargeback. |
| SYS-035 | CRITICAL | Auditoria | Ausente | Ações financeiras e administrativas não possuem audit log visível no desenho. | Fica difícil investigar fraude, disputa e alterações de preço. | Registar actor, action, before/after, resource, IP/device e timestamp. |
| SYS-036 | HIGH | Contratos | P14/P16 | Proposta, contraproposta e direitos de uso não possuem versionamento contratual. | Depois de negociar preço/direitos não há prova imutável do que foi aceite. | Criar ProposalVersion/OfferSnapshot e acceptance timestamp. |
| SYS-037 | HIGH | Direitos de conteúdo | P15/P16 | Direitos pessoais/comerciais/download/offline aparecem em UI sem política de licenciamento formal. | Pode haver conflito sobre reutilização de media e campanhas. | Modelar license type no OrderItem snapshot e mostrar termos antes do pagamento. |
| SYS-038 | HIGH | Briefing | P4/P6 | Um único briefing é usado conceptualmente para produtos muito diferentes. | Pergunta, call, serviço, brand campaign, vídeo e apoio exigem campos distintos. | Criar schema de briefing por InteractionType/Service. |
| SYS-039 | HIGH | Disponibilidade | P4/P16/P17 | Vagas são descritas ora por dia, ora por semana, com reset diário genérico. | O utilizador vê disponibilidade contraditória. | Definir capacityPeriod por oferta: DAY/WEEK/CUSTOM e fonte única de verdade. |
| SYS-040 | HIGH | Concorrência | Checkout/slots | Não existe reserva temporária de vaga durante checkout. | Duas pessoas podem comprar a última vaga ao mesmo tempo. | Implementar slot hold com TTL e confirmação transacional. |
| SYS-041 | MEDIUM | Locale | Diversos | Moeda, datas e fuso estão visualmente fixos; regras de timezone não aparecem. | Eventos/calls e expansão africana podem apresentar horas erradas. | Guardar UTC + timezone IANA e formatar por locale. |
| SYS-042 | HIGH | Financeiro | P18/P19 | Não existe definição consistente de bruto, taxa, líquido, retido, disponível e em levantamento. | Analytics e carteira podem discordar mesmo com dados corretos. | Publicar glossary financeiro e usar métricas derivadas do ledger. |
| SYS-043 | MEDIUM | Copy/Produto | Vários ecrãs | Algumas promessas são absolutas ('devolvemos sem te pedir nada', 'entra sozinho', 'teu para sempre') sem condições técnicas/jurídicas. | Cria obrigação que o sistema pode não conseguir cumprir em todos os casos. | Transformar promessas em regras verificáveis e termos coerentes. |
| SYS-044 | HIGH | Operação | Payout | Não existe gestão de limites, payout minimum, verificação de titular, payout pending e fallback bancário. | Levantamentos podem falhar sem rota de resolução. | Criar payout state machine e provider abstraction. |
| SYS-045 | MEDIUM | Design System | Código inline | Grande parte do design está codificada como estilos específicos por ecrã. | A consistência tende a degradar quando o frontend crescer. | Extrair tokens, primitives e componentes NaDM com variantes e estados. |

## P1 — erros específicos

| ID | Severidade | Tipo | Evidência | Erro | Impacto | Correção necessária |
|---|---|---|---|---|---|---|
| P1-001 | HIGH | Lógica | P1 playlists | Playlist 'Membros' abre P3 no estado `nao`, como se não houvesse entitlement de membership. | Membro pago pode ser tratado como não comprador. | Resolver acesso pelo entitlement atual e abrir estado membership-unlocked. |
| P1-002 | MEDIUM | UX | P1 perfil público | Há muita informação operacional/trust/ofertas antes do feed, podendo transformar o perfil social em dashboard. | Reduz escaneabilidade e sensação de perfil. | Usar progressive disclosure mantendo todas as funções, sem removê-las. |
| P1-003 | HIGH | Dados | P1 rotas de feed/perfil | Feed e playlists navegam para recursos genéricos sem IDs de publicação/playlist. | Conteúdo distinto perde identidade no fluxo. | Rotas devem carregar postId/playlistId. |
| P1-004 | MEDIUM | Reputação | P1 trust cards | Métricas de reputação aparecem como valores prontos sem definição do período/denominador para todas. | Usuário pode interpretar 96%, 184 e 4,9 de forma errada. | Documentar cálculo e permitir detalhes. |
| P1-005 | HIGH | Disponibilidade | P1 vs P4/P17 | Vagas do perfil são snapshots independentes dos estados da agenda/oferta. | Perfil pode dizer 2 vagas enquanto P17 está esgotado. | Derivar todas as vagas de Availability/Capacity no backend. |
| P1-006 | MEDIUM | Auth/Role | P1 `meu` vs visitante | O mesmo ecrã muda radicalmente pelo variant local, não por ownership real. | Uma rota errada pode mostrar ações de dono. | Validar ownership e capability server-side. |

## P2 — erros específicos

| ID | Severidade | Tipo | Evidência | Erro | Impacto | Correção necessária |
|---|---|---|---|---|---|---|
| P2-001 | CRITICAL | Funcional | P2 `pay` | Tocar em desbloquear só muda de `bloqueado` para `pagar`; não existe transição real para checkout/P7. | Compra de post fica num dead end. | Conectar P2 -> Quote -> Payment -> Entitlement -> P2 unlocked. |
| P2-002 | HIGH | Conteúdo | P2 meta vs ganhos | Quantidade de itens é inconsistente: meta fala em 4 fotos + 1 vídeo, benefícios falam em 3 fotos + vídeo. | Cliente não sabe exatamente o que compra. | Snapshot de produto deve conter quantidade e media IDs únicos. |
| P2-003 | HIGH | Financeiro | P2 copy | Copy sugere retenção até 'abrir' conteúdo digital instantâneo. | Hold não tem utilidade clara para unlock imediato. | Para digital instantâneo, capturar e liberar entitlement segundo política específica. |
| P2-004 | HIGH | Entitlement | P2 estados | `aberto`, `membro` e `meu` misturam conteúdo público, membership e compra permanente. | Política de acesso fica ambígua. | Modelar origem do entitlement separadamente da visibilidade do post. |
| P2-005 | MEDIUM | Reações | P2 | Reações/comentários não mostram proteção contra spam nem regras para conteúdo pago. | Pode permitir interação indevida ou abuso. | Validar entitlement + rate limit para comentar/reagir. |
| P2-006 | MEDIUM | Offline | P2/P11 | 'Teu para sempre' não define o que acontece se o conteúdo for removido por moderação/direitos. | Promessa absoluta pode ser impossível. | Distinguir licença permanente de disponibilidade física eterna. |

## P3 — erros específicos

| ID | Severidade | Tipo | Evidência | Erro | Impacto | Correção necessária |
|---|---|---|---|---|---|---|
| P3-001 | BLOCKER | Pagamentos | P3 `p3Buy` | Comprar playlist muda diretamente para `comprada` sem passar pelo pagamento. | Acesso pago pode ser obtido sem cobrança. | Obrigar checkout confirmado antes de emitir entitlement. |
| P3-002 | HIGH | Funcional | P3 lista | Itens de vídeo são essencialmente estáticos; falta navegação real por vídeo. | Playlist não funciona como player completo. | Adicionar currentMediaId, progress e handlers por item. |
| P3-003 | HIGH | Entitlement | P3 membership | Não existe estado claro para playlist desbloqueada por membership. | Membro pode cair na compra avulsa. | Adicionar source=MEMBERSHIP e expiry. |
| P3-004 | MEDIUM | Offline | P3 | Modo offline não define download, quota, expiração, remoção de dispositivo e DRM/licença. | Pode gerar custo e redistribuição não autorizada. | Criar OfflineAsset entitlement e regras de cache. |
| P3-005 | MEDIUM | Playback | P3 | Buffer/offline são estados visuais, sem estratégia de retry e network recovery. | Experiência quebra em redes móveis instáveis. | Adicionar retry, adaptive streaming e resume. |
| P3-006 | HIGH | Financeiro | P3 | Preço da playlist não gera Order snapshot antes do acesso. | Histórico financeiro e biblioteca não terão uma fonte auditável. | Todo produto pago precisa de Order/OrderItem. |

## P4 — erros específicos

| ID | Severidade | Tipo | Evidência | Erro | Impacto | Correção necessária |
|---|---|---|---|---|---|---|
| P4-001 | BLOCKER | Funcional | `sheetMap` ~4180+ | Só 'Resposta em vídeo' e 'Contratação de marca' têm sheet específico; todas as outras ofertas usam um default de 3.500 Kz/24h/7 vagas. | DM prioritária, chamada, serviço, apoio e mensagem grátis podem mostrar preço/prazo incorretos. | Criar sheet data-driven por offerId. |
| P4-002 | BLOCKER | Fluxo | `sheetAvancar` | Qualquer oferta avança para P6 `teclado`. | Mensagem grátis, call, apoio, serviço e campanha entram num briefing de resposta em vídeo. | Roteamento deve depender do tipo de oferta. |
| P4-003 | CRITICAL | Mensagem grátis | P4 | Mensagem grátis é `open: true` e cai no sheet default pago. | Fluxo gratuito pode pedir preço/checkout. | Mensagem grátis deve abrir conversa e consumir quota quando enviada. |
| P4-004 | CRITICAL | Call | P4 -> P6 | Chamada de 15 min não vai primeiro para escolha de horário P24. | Pode cobrar sem reservar slot. | Call -> schedule hold -> quote -> payment. |
| P4-005 | HIGH | Tip | P4 Apoio livre | Apoio livre cai no mesmo modelo de briefing/entrega. | Tip não deve exigir entrega ou aprovação. | Criar TIP flow com valor customizado e confirmação. |
| P4-006 | HIGH | Brand | P4 Contratação de marca | Pedir proposta cai no briefing genérico após o sheet. | Não recolhe campos de campanha nem cria Proposal. | Abrir brand brief -> Proposal, sem Order até termos aceites. |
| P4-007 | HIGH | Service | P4 Marcação de serviço | Não existe agenda/data/slot associada ao serviço. | Pode vender marcação sem disponibilidade. | Integrar service booking com Availability. |
| P4-008 | MEDIUM | Quota | Mensagem grátis 1/semana | Não existe contador/reset/anti-abuse visível para a quota semanal. | Regra pode ser burlada ou aplicada de forma opaca. | Criar quota por creator+buyer+period. |
| P4-009 | HIGH | Pricing | P4 | Preço mostrado no catálogo não está garantido como quote imutável no checkout. | Pode mudar entre seleção e pagamento. | Criar Quote com expiry e snapshot. |

## P5 — erros específicos

| ID | Severidade | Tipo | Evidência | Erro | Impacto | Correção necessária |
|---|---|---|---|---|---|---|
| P5-001 | CRITICAL | Funcional | `ordAprovar` | No estado aprovado, CTA 'Avaliar' não navega para P10; permanece em aprovado. | Review fica inacessível por esse caminho. | Rota aprovada -> P10 poravaliar. |
| P5-002 | HIGH | Funcional | `ordAlterar` | Ação secundária em estados que não são `entregue` é no-op. | Botões como 'Ver ficheiro' podem não fazer nada. | Separar handlers por ação, não reutilizar `ordAlterar`. |
| P5-003 | HIGH | Chat | ordEscreve | Chat é desativado em estados como aceite/entregue/alteração, apesar da premissa de conversa contextual. | Comprador e criador podem precisar esclarecer detalhes justamente nesses estados. | Definir quando chat é bloqueado por política, não por estado arbitrário. |
| P5-004 | HIGH | Disputa | P5 | Não há entrada clara de disputa/refund dentro da thread do pedido. | Usuário precisa sair do contexto para resolver problema. | Adicionar ações contextuais com eligibility. |
| P5-005 | MEDIUM | Files | P5 | Ficheiro entregue é apenas estado visual, sem preview/download/virus scan/version history. | Entrega não é auditável. | Criar DeliveryAsset versionado. |
| P5-006 | HIGH | Timeline | P5 | Datas/prazos de exemplo não batem com '3 dias' da oferta em alguns estados. | Pode passar uma promessa temporal impossível. | Deadline deve ser calculado a partir de acceptedAt + SLA. |
| P5-007 | HIGH | State machine | P5 | Order e Conversation state estão acoplados manualmente por variant. | Mensagens podem mostrar estado diferente do Order real. | Conversation deve apenas renderizar Order.status da API. |

## P6 — erros específicos

| ID | Severidade | Tipo | Evidência | Erro | Impacto | Correção necessária |
|---|---|---|---|---|---|---|
| P6-001 | BLOCKER | Validação | `p6Avancar` | CTA sempre navega para pagamento, mesmo quando visualmente disabled. | Pedido pode ser pago com briefing incompleto. | Bloquear evento + validar schema no backend. |
| P6-002 | CRITICAL | Fluxo | P6 fixo | Briefing é de resposta em vídeo para ofertas diferentes. | Campos não correspondem ao produto comprado. | Renderizar form schema por offer/service type. |
| P6-003 | HIGH | Preço | P6 | CTA mostra total 18.900 Kz sem decompor claramente a fee antes da confirmação. | Surpresa de preço no checkout. | Mostrar subtotal, fee, total e creator terms antes de pagar. |
| P6-004 | MEDIUM | Autosave | P6 | Copy diz que guarda automaticamente, mas não existe persistência/draft model demonstrado. | Utilizador pode acreditar que briefing está salvo. | Implementar Draft com autosave real e timestamp. |
| P6-005 | HIGH | Anexos | P6 | Anexos aparecem sem upload state/validation/removal/size limits. | Briefing pode conter ficheiros não carregados. | Usar Media upload pipeline e referências confirmadas. |
| P6-006 | MEDIUM | Steps | P6 | Indicador de passos não corresponde a uma máquina de passos real; CTA pode saltar diretamente. | Progresso visual não representa validação. | State machine local do formulário com gates por step. |

## P7 — erros específicos

| ID | Severidade | Tipo | Evidência | Erro | Impacto | Correção necessária |
|---|---|---|---|---|---|---|
| P7-001 | BLOCKER | Pagamentos | `p7Avancar` | Todos os estados navegam para P8 espera. | Falha, expiração e sem rede podem ser tratados como pagamento concluído. | Cada estado precisa de ação própria; somente CONFIRMED pode criar/ativar order. |
| P7-002 | BLOCKER | Pagamentos | P7 'Já confirmei' | Confirmação declarada pelo utilizador não consulta o provider antes de avançar. | Risco de acesso/pedido sem dinheiro. | Poll provider/payment status server-side. |
| P7-003 | CRITICAL | Retry | P7 | 'Tentar outra vez' reutiliza a mesma transição sem criar/renovar payment intent de modo seguro. | Pode duplicar ou perder referências. | Criar retry idempotente e substituir intent expirado. |
| P7-004 | CRITICAL | Expiração | P7 | 'Começar de novo' não reinicia quote/order/payment; simplesmente avança. | Estados expirados tornam-se inconsistentes. | Expired -> new quote/payment intent. |
| P7-005 | HIGH | Rede | P7 | Sem rede promete entrada automática sem explicar sync e provider status. | Pode mostrar falso positivo. | Persistir pending intent e reconciliar ao recuperar conexão. |
| P7-006 | HIGH | Produto | P7 | Pagamento está hardcoded para resposta em vídeo/18.900 Kz, mas é reutilizado por calls e outros fluxos. | Produto/valor errado pode ser cobrado. | Payment screen deve receber orderId e renderizar quote. |
| P7-007 | HIGH | Security | P7 | Não há proteção visível contra replay/double-submit. | Cobrança duplicada. | Idempotência + disable durante submit + provider uniqueness. |
| P7-008 | MEDIUM | Receipt | P7 | Não há receipt/transaction reference imediata após confirmação. | Suporte financeiro fica difícil. | Mostrar provider reference e Order ID. |

## P8 — erros específicos

| ID | Severidade | Tipo | Evidência | Erro | Impacto | Correção necessária |
|---|---|---|---|---|---|---|
| P8-001 | CRITICAL | Funcional | `p8Ir` | Estados recusado/expirado são enviados para P5 `devolvido`, mesmo quando CTA diz procurar outro criador/tentar outra oferta. | Destino não corresponde à ação mostrada. | Mapear CTA para discovery/offer, e refund thread apenas quando aplicável. |
| P8-002 | HIGH | Estado | P8 | Pedido pode existir em 'espera' vindo de P7 sem confirmação financeira real. | Order state fica contaminado. | Só criar/ativar order conforme payment state machine. |
| P8-003 | HIGH | Tempo | P8 | Prazo de entrega exibido não é consistentemente derivado do SLA da oferta. | Promessa pode ser incorreta. | Deadline backend-calculated. |
| P8-004 | MEDIUM | Refund | P8 | Recusa/expiração não mostram refund reference/tempo/provider. | Usuário não consegue acompanhar devolução. | Criar Refund entity/status. |
| P8-005 | MEDIUM | Navigation | P8 | A tela mistura estado de pedido e call-to-action de descoberta. | Pode quebrar continuidade. | Separar order result de next-best-action. |

## P9 — erros específicos

| ID | Severidade | Tipo | Evidência | Erro | Impacto | Correção necessária |
|---|---|---|---|---|---|---|
| P9-001 | BLOCKER | Funcional | `p9Aprovar` | No variant `alteracao`, o CTA pode estar rotulado 'Ver a conversa', mas o handler aprova o trabalho. | Um clique pode liberar dinheiro sem intenção. | Handlers devem ser por actionId; nunca por botão reutilizado. |
| P9-002 | HIGH | Alterações | P9 | Depois de 1/1 alteração usada ainda aparece caminho de pedir alteração em estados posteriores. | Pode exceder contrato. | Enforce alterationRemaining no backend e UI. |
| P9-003 | CRITICAL | Auto-approval | P9 | Aprovação automática é apenas copy/timer; não existe job/state transition real. | Dinheiro pode ficar preso ou liberar errado. | Scheduled job idempotente baseado em approvalDeadline. |
| P9-004 | HIGH | Delivery | P9 | Não há comparação de versões após alteração. | Comprador não sabe qual ficheiro é final. | DeliveryVersion com version number e changelog. |
| P9-005 | MEDIUM | Deadline | P9 | Contagem é visual e pode divergir do relógio servidor. | Usuário vê prazo incorreto. | Usar timestamp absoluto do backend. |
| P9-006 | HIGH | Money | P9 | Aprovar é ação financeira irreversível mas não possui confirmação contextual. | Cliques acidentais podem liberar fundos. | Confirm sheet quando política tornar aprovação final. |

## P10 — erros específicos

| ID | Severidade | Tipo | Evidência | Erro | Impacto | Correção necessária |
|---|---|---|---|---|---|---|
| P10-001 | CRITICAL | Funcional | `p10CtaStyle` + `p10Avancar` | Review fica visualmente disabled em `poravaliar`, mas clique ainda muda para avaliado. | Review pode ser publicada sem nota. | Remover handler quando inválido e validar rating. |
| P10-002 | CRITICAL | Funcional | `p10Flores` | Flores de rating não possuem handlers; o utilizador não escolhe 1–5. | Sistema de avaliação não é funcional. | Adicionar rating state e action por estrela/flor. |
| P10-003 | HIGH | Disputa | `p10Avancar` | CTAs de estados de devolução/disputa permanecem no mesmo variant. | Ações como acompanhar, aceitar regravação ou ver comprovativo não executam fluxo. | Criar handlers e states distintos. |
| P10-004 | HIGH | Refund | P10 | Não existe partial refund. | Casos mistos não podem ser resolvidos proporcionalmente. | Adicionar refundAmount e settlement outcome. |
| P10-005 | HIGH | Evidence | P10 | Não existe envio/consulta de evidências estruturadas. | Moderação decide sem prova organizada. | Adicionar dispute evidence + timeline. |
| P10-006 | HIGH | Appeal | P10 | Não existe recurso/apelação ou SLA de disputa. | Decisões contestadas não têm caminho. | Criar dispute lifecycle e appeal policy. |
| P10-007 | MEDIUM | Review integrity | P10 | Não há regra visual de uma review por order, edição ou denúncia. | Pode gerar duplicação/manipulação. | Enforce unique(orderId, authorId) e review moderation. |
| P10-008 | MEDIUM | State | P10 | Review e refund estão concentrados no mesmo ecrã sem entidade operacional comum claramente definida. | Complexidade de estado cresce. | Separar Review workflow de Dispute workflow, mantendo acesso contextual. |

## P11 — erros específicos

| ID | Severidade | Tipo | Evidência | Erro | Impacto | Correção necessária |
|---|---|---|---|---|---|---|
| P11-001 | HIGH | Funcional | P11 arrays | Biblioteca, pedidos e conversas são mostrados sem navegação individual robusta por recurso. | Área 'Meu' vira vitrine estática. | Cada item deve abrir por resourceId. |
| P11-002 | CRITICAL | Role | barra P11 | 'Perfil' pode navegar para P1 `meu`, exibindo modo de dono ao comprador. | Vazamento de papel/capability. | Perfil do comprador e perfil creator devem ser resolvidos pelo account context. |
| P11-003 | HIGH | Entitlement | Biblioteca | Não diferencia compra permanente de acesso temporário por membership. | Conteúdo pode permanecer ou sumir incorretamente. | Mostrar entitlement source/expiry. |
| P11-004 | MEDIUM | Navigation | P11 | Item 'Ver' da barra aponta especificamente para P3, não para biblioteca geral. | Navegação global depende de um produto demo. | Criar rota Library. |
| P11-005 | HIGH | Order status | P11 | Pedido entregue pode não respeitar o status real de aprovação quando aberto. | Usuário cai no estágio errado. | Usar orderId/status real. |
| P11-006 | MEDIUM | Empty state | P11 | Estado vazio não diferencia nunca comprou vs acesso expirado vs conteúdo removido. | Próxima ação fica genérica. | Criar empty reasons. |

## P12 — erros específicos

| ID | Severidade | Tipo | Evidência | Erro | Impacto | Correção necessária |
|---|---|---|---|---|---|---|
| P12-001 | HIGH | Routing | P12 fila | Itens não-marca tendem a abrir P5 `aceite`, mesmo quando são pedidos novos/urgentes a decidir. | Aceitação pode ser implicitamente pulada. | Fila deve abrir Order conforme status real; novo -> P23 decidir. |
| P12-002 | HIGH | Financeiro | P12 cards | Disponível/retido/mês são números estáticos sem reconciliação com P18. | Dashboard pode discordar da carteira. | Derivar do ledger. |
| P12-003 | MEDIUM | Availability | P12 | Barras de vagas são apenas resumo, sem ligação inequívoca à oferta/período. | Creator não sabe o que resetará. | Mostrar capacity period e link para P17. |
| P12-004 | MEDIUM | Prioridade | P12 | Fila mistura prazo, dinheiro, marca e mensagem sem regra explícita de ordenação. | Itens críticos podem ficar abaixo de menos importantes. | Ordenar por deadline/risk e permitir filtros. |
| P12-005 | HIGH | Context | P12 | Dashboard assume creator mesmo em conta híbrida sem seletor/contexto claro. | Pessoa comprador+creator pode não saber em que modo está. | Definir account mode sem duplicar contas. |

## P13 — erros específicos

| ID | Severidade | Tipo | Evidência | Erro | Impacto | Correção necessária |
|---|---|---|---|---|---|---|
| P13-001 | HIGH | Funcional | P13 filtros | Filtros 'Conversas' e 'Trabalhos' roteiam para `naolidos`. | Dois filtros visíveis não funcionam. | Implementar estados/queries próprios. |
| P13-002 | HIGH | Funcional | `p13Limpar` | 'Marcar lidas' leva ao estado vazio, removendo visualmente tudo. | Read status é confundido com ausência de inbox. | Atualizar readAt e manter histórico. |
| P13-003 | HIGH | Routing | P13 linhas | Conversas/trabalhos não-marca são abertas em P5 `espera` independentemente do status. | Thread pode exibir status incorreto. | Abrir conversationId/orderId e derivar estado. |
| P13-004 | MEDIUM | Search | P13 | Busca prometida na especificação não está funcional no mockup. | Inbox grande fica difícil de usar. | Implementar search por pessoa/order/status. |
| P13-005 | MEDIUM | Empty CTA | P13 | CTA de estado vazio como 'Copiar o meu link' não possui fluxo claro. | Ação pode ser decorativa. | Conectar diretamente a P30. |
| P13-006 | HIGH | Taxonomia | P13 | Mensagem, pedido, trabalho e pagamento aparecem juntos sem IDs/relação forte. | Pode haver duplicação do mesmo caso em várias linhas. | Agrupar por conversation/order e facets. |
| P13-007 | MEDIUM | Read semantics | P13 | Novidade/read e urgência/deadline são tratados na mesma camada visual. | Usuário pode priorizar errado. | Separar unread, priority e SLA risk. |

## P14 — erros específicos

| ID | Severidade | Tipo | Evidência | Erro | Impacto | Correção necessária |
|---|---|---|---|---|---|---|
| P14-001 | HIGH | Funcional | `p14Ir` | Ações pós-decisão retornam genericamente à caixa. | CTAs como abrir trabalho/ver conversa não levam ao destino prometido. | Mapear por CTA: conversation, order/workspace ou inbox. |
| P14-002 | CRITICAL | Contrato | P14 | Aceitar/contrapor não cria snapshot versionado de preço, âmbito e direitos. | Termos podem mudar sem prova do aceite. | ProposalVersion + acceptedVersionId. |
| P14-003 | HIGH | Brand-side | P14 | Contraproposta do creator não possui fluxo correspondente para a marca aceitar/recusar. | Negociação termina unilateralmente. | Criar participant workflow para business. |
| P14-004 | HIGH | Pagamentos | P14 | Depois de aceitar uma proposta não está definido como/quanto a marca financia. | Trabalho pode começar sem fundo confirmado. | Accepted proposal -> funded Order/contract. |
| P14-005 | MEDIUM | Expiry | P14 | Prazo da proposta é visual sem job de expiração/version lock. | Pode aceitar proposta vencida. | Enforce expiresAt server-side. |
| P14-006 | HIGH | Rights | P14 | Direitos de uso e exclusividade não possuem enforcement/aceite jurídico. | Conflito comercial posterior. | Term snapshot + explicit acceptance. |

## P15 — erros específicos

| ID | Severidade | Tipo | Evidência | Erro | Impacto | Correção necessária |
|---|---|---|---|---|---|---|
| P15-001 | CRITICAL | Funcional | P15 controls | Pastas, visibilidade, preços, etiquetas e vários switches usam `() => {}`. | Editor parece completo mas escolhas não alteram nada. | Implementar form state real para cada campo. |
| P15-002 | CRITICAL | Validação | `p15Avancar` | Publicação pode avançar mesmo quando upload está em `carregar`/falhado; disabled é essencialmente visual. | Post pode ser publicado sem media válida. | Bloquear submit até upload COMPLETED. |
| P15-003 | HIGH | Funcional | P15 pasta | Estado `pasta` navega para ele próprio ao avançar. | Criação de pasta fica presa em loop. | Validar nome e criar Folder, depois retornar ao editor. |
| P15-004 | BLOCKER | Pagamentos | P15 playlist | 'Pôr à venda' navega para P3 `nao`, não cria produto/orderable listing. | Creator cai na visão de comprador em vez de publicar. | Criar Playlist publication/product state. |
| P15-005 | CRITICAL | Modelo de negócio | P15 preço próprio | Preço personalizado está disponível sem NaDM Pro. | Bypass da principal regra de monetização. | Gate CUSTOM_PRICING. |
| P15-006 | HIGH | Forecast | P15 estimativa | Estimativa de 40–60 desbloqueios aparece como previsão forte sem indicar confiança/amostra suficiente. | Pode induzir creator a decisão financeira errada. | Mostrar apenas com volume mínimo e intervalo/confidence. |
| P15-007 | HIGH | Offline | P15 | 'Guardar para ver sem rede' é toggle sem licença, quota ou custo. | Pode liberar download de conteúdo que creator não quer distribuir. | Definir offline permission no produto e entitlement. |
| P15-008 | MEDIUM | Scheduling | P15 | Agendamento não mostra timezone nem edição/cancelamento antes da publicação. | Post pode sair em hora errada. | Usar timezone e scheduled job. |
| P15-009 | HIGH | Membership | P15 | Conteúdo 'só membros' não permite escolher tier específico. | Todos os membros recebem o mesmo acesso. | Relacionar post com MembershipTier(s). |
| P15-010 | MEDIUM | Folder visibility | P15 | Pasta visível vira separador do perfil, mas não há limite/ordenação/responsividade definidos. | Perfil pode ficar saturado. | Definir max/ordering e overflow responsive. |

## P16 — erros específicos

| ID | Severidade | Tipo | Evidência | Erro | Impacto | Correção necessária |
|---|---|---|---|---|---|---|
| P16-001 | BLOCKER | Modelo de negócio | P16 | Editor assume que 'tudo é editável' sem verificar NaDM Pro. | Free consegue customizar preço e regras premium. | Entitlements backend + paywall contextual. |
| P16-002 | CRITICAL | Funcional | `p16Precos` | Pills 12k/18k/25k usam handler vazio. | Preço visual não muda. | Bind a controlled price field. |
| P16-003 | CRITICAL | Funcional | `p16Controlos` | Menos/mais de prazo, vagas e alterações são no-op. | Configuração central da oferta não funciona. | Persistir numeric controls com limites. |
| P16-004 | CRITICAL | Funcional | P16 direitos | Opções de direitos de uso usam `() => {}`. | Creator não consegue definir licença. | Controlled selection + pricing impact. |
| P16-005 | CRITICAL | Funcional | P16 regras | Switches de briefing, anexos, autoaceite e followers-only são no-op. | Regras exibidas não têm efeito. | Persistir offer rules e enforce no backend. |
| P16-006 | CRITICAL | Funcional | P16 cancelamento | Políticas de cancelamento são no-op. | Buyer pode ver uma política que nunca foi salva. | Policy selection versionada. |
| P16-007 | HIGH | Pricing | P16 rights extra | Extra de +4.000 Kz por rights não entra em quote/total. | Checkout pode cobrar valor errado. | Price modifier engine. |
| P16-008 | HIGH | Auto-accept | P16 | Aceitação automática não define em que momento prazo/hold começam. | Order pode começar sem creator realmente ver o briefing. | Definir transition PAID -> ACCEPTED e SLA start. |
| P16-009 | HIGH | Cancellation | P16 | 'Até 24h' é ambíguo: 24h após compra, antes do prazo ou antes da entrega. | Refund policy imprevisível. | Definir reference timestamp. |
| P16-010 | HIGH | Fees | P16 | Net 17.100 Kz assume taxa fixa 5%. | Conflita com fee model ainda não fechado. | Calcular net em quote backend. |
| P16-011 | HIGH | Funcional | `p16Avancar` | CTAs de estados diferentes retornam genericamente a P4. | Pausar, reativar ou abrir vagas pode não alterar a oferta. | Persistir mutation específica antes de navegar. |
| P16-012 | MEDIUM | Capacity | P16 | Vagas 'por semana' conflitam com P17 reset diário. | Disponibilidade divergente. | CapacityPeriod único. |

## P17 — erros específicos

| ID | Severidade | Tipo | Evidência | Erro | Impacto | Correção necessária |
|---|---|---|---|---|---|---|
| P17-001 | CRITICAL | Funcional | P17 Dias/Horas | Seleção de dias/horas é visual; controlos não possuem ação efetiva. | Agenda não pode ser configurada. | Adicionar schedule editor real. |
| P17-002 | HIGH | Funcional | `p17Alternar` | Alternar só troca disponível/esgotado e trata outros estados de forma genérica. | Estado 'quase' pode saltar incorretamente. | Actions explícitas: pause, reopen, set capacity. |
| P17-003 | HIGH | Funcional | `p17Alternar2` | 'Mudar data' em pausa pode simplesmente reativar a disponibilidade. | Ação e label não correspondem. | Abrir date picker/range editor. |
| P17-004 | HIGH | Lógica | P17 reset | Copy diz que vagas voltam ao cheio diariamente às 08h, enquanto ofertas podem ser semanais. | Capacidade é inconsistente. | Reset conforme capacityPeriod. |
| P17-005 | HIGH | Race condition | P17 | Lotação não considera holds de checkout. | Overbooking. | Disponibilidade deve descontar RESERVED + CONFIRMED. |
| P17-006 | MEDIUM | Timezone | P17 | Hora de reset/agendamento não explicita timezone de regra. | Mudança de país/fuso gera erro. | Timezone por creator/service. |
| P17-007 | MEDIUM | Exceptions | P17 | Não existe exceção de feriado, bloqueio pontual ou indisponibilidade por data. | Agenda real fica rígida. | AvailabilityException. |
| P17-008 | HIGH | Sync | P17/P4 | Não está garantido que alterações da agenda atualizem DM/perfil em tempo real. | Usuário compra vaga fechada. | Fonte única e invalidate/cache realtime. |

## P18 — erros específicos

| ID | Severidade | Tipo | Evidência | Erro | Impacto | Correção necessária |
|---|---|---|---|---|---|---|
| P18-001 | CRITICAL | Funcional | `p18Avancar` | Estado sem dados pode ir de `dados` diretamente a `saldo` sem recolher/validar destino de payout. | Saldo fica aparentemente pronto sem método de recebimento confirmado. | Criar payout-method form + verification. |
| P18-002 | HIGH | Funcional | P18 disabled | CTA visualmente indisponível ainda possui handler. | Pode iniciar fluxo de levantamento sem saldo. | Disable action de verdade + backend minimum check. |
| P18-003 | HIGH | Dados | P18 | Campanha aparece como 35.000 Kz, enquanto P14 usa 350.000 Kz. | Ledger/demo contraditório. | Usar a mesma order source. |
| P18-004 | HIGH | Dados | P18 | Chamada retida aparece 19.000 Kz, enquanto P4/P24 usam 45.000 Kz. | Carteira e catálogo divergem. | Referenciar order amount snapshot. |
| P18-005 | HIGH | Financeiro | P18 | Disponível, retido e taxa mensal não reconciliam explicitamente com P19. | Creator não consegue auditar ganhos. | Mostrar ledger drill-down. |
| P18-006 | HIGH | Payout | P18 | Não há input de valor a levantar. | Todo saldo parece sair em bloco. | Permitir amount com min/max/reserve. |
| P18-007 | HIGH | Payout | P18 | Faltam PENDING/PROCESSING/FAILED/REVERSED detalhados por payout. | Falhas ficam difíceis de resolver. | Payout state machine. |
| P18-008 | HIGH | Security | P18 | Mudar destino financeiro não mostra OTP/re-auth no fluxo, apesar da copy de P20. | Conta comprometida pode redirecionar dinheiro. | Step-up auth para payout method. |
| P18-009 | MEDIUM | Documents | P18 | Documentos/recibos financeiros não têm período, referência fiscal e download verificável. | Contabilidade fica fraca. | Invoice/statement entity. |
| P18-010 | MEDIUM | Empty state | P18 sem | Estado 'sem saldo' ainda pode mostrar movimento/taxa, confundindo primeiro mês com actividade financeira. | Mensagem contraditória. | Separar no-earnings, no-available-balance e fees-only. |

## P19 — erros específicos

| ID | Severidade | Tipo | Evidência | Erro | Impacto | Correção necessária |
|---|---|---|---|---|---|---|
| P19-001 | HIGH | Modelo de negócio | P19 | Recomendação 'subir preço' não respeita se o creator é Free sem custom pricing. | Sugere ação bloqueada. | Se Free, transformar insight em upsell Pro; se Pro, linkar editor. |
| P19-002 | MEDIUM | Analytics | P19 | Não há filtro de período nem timezone. | Comparações podem misturar janelas. | Date range + period definitions. |
| P19-003 | MEDIUM | Analytics | P19 | Taxa 7,4% e '1 em 13' não são exatamente equivalentes. | Métrica perde credibilidade. | Derivar texto do mesmo valor/denominador. |
| P19-004 | HIGH | Financeiro | P19 | Não está claro se receita é GMV, gross creator revenue ou net. | Comparação com carteira/fees fica ambígua. | Nomear gross/net e reconciliar com ledger. |
| P19-005 | HIGH | Analytics | P19 | Insights são apresentados como conclusão causal ('vale subir preço') sem modelo/experimento. | Pode orientar mal decisões comerciais. | Apresentar como hipótese e mostrar dados que suportam. |
| P19-006 | MEDIUM | Reviews | P19 | Avaliações exibidas não têm filtro por serviço/order nem distribuição. | Média pode esconder problemas. | Adicionar breakdown e source order. |

## P20 — erros específicos

| ID | Severidade | Tipo | Evidência | Erro | Impacto | Correção necessária |
|---|---|---|---|---|---|---|
| P20-001 | CRITICAL | Funcional | P20 grupos/ações | Vários switches e ações de settings são visual-only/no-op. | Preferências não são persistidas. | Form state + API mutations. |
| P20-002 | HIGH | Routing | P20 salvar | Salvar aparência volta a P1 `cheio` em vez de modo proprietário. | Creator pode cair como visitante. | Voltar ao perfil próprio com ownership correto. |
| P20-003 | CRITICAL | Safety | P20 ações destrutivas | Pausar/esconder/apagar não têm confirmação, explicação de consequências ou fluxo funcional. | Risco de perda/estado inesperado. | Confirmations, re-auth e grace period para delete. |
| P20-004 | HIGH | Privacidade | P20 | Mostrar compradores publicamente não possui consentimento do comprador. | Exposição de dados pessoais. | Opt-in bilateral ou anonimização. |
| P20-005 | HIGH | Trust | P20 | Creator pode potencialmente esconder métricas de confiança sem definir quais são obrigatórias. | Comparabilidade do marketplace é reduzida. | Definir trust metrics non-hideable. |
| P20-006 | HIGH | Money settings | P20 | Copy diz que mudanças financeiras pedem SMS, mas fluxo concreto não existe. | Proteção prometida não é implementada. | Step-up verification. |
| P20-007 | MEDIUM | Account | P20 | Não há gestão de sessões/dispositivos/social accounts conectadas. | Segurança incompleta. | Adicionar security/account connections. |
| P20-008 | MEDIUM | Data rights | P20 | Delete account não mostra retenção legal de orders/payments/invoices. | Pode prometer apagamento incompatível com obrigações financeiras. | Definir deletion vs legal retention. |

## P21 — erros específicos

| ID | Severidade | Tipo | Evidência | Erro | Impacto | Correção necessária |
|---|---|---|---|---|---|---|
| P21-001 | BLOCKER | Auth | `p21Avancar` | Depois do estado `numero`, qualquer outro variant pode navegar para P22; código errado/enviando não é bloqueado. | Conta pode entrar no onboarding sem OTP validado. | Apenas VERIFIED_SESSION pode avançar. |
| P21-002 | HIGH | Auth | P21 providers | Login social aparece como fluxo visual sem modelar sucesso, cancelamento, scopes e conta já existente. | Duplicação de contas e identidade. | OAuth callback/linking state machine. |
| P21-003 | HIGH | Account merge | P21 | Não há regra para mesmo telefone/email usado após login Instagram/TikTok/Google. | Pode criar múltiplas contas para a mesma pessoa. | Identity linking/merge policy. |
| P21-004 | HIGH | Security | P21 OTP | Não aparecem rate limit, tentativas, resend cooldown e lockout. | Bruteforce/SMS abuse. | OTP attempt and resend limits. |
| P21-005 | MEDIUM | Copy/Input | P21 | Placeholder do telefone é inconsistente/incompleto em relação ao número mostrado noutros estados. | Aumenta erro de entrada. | Phone input E.164 + máscara local. |
| P21-006 | HIGH | Recovery | P21 | Não existe 'perdi o número' ou recuperação. | Usuário pode perder acesso a saldo/perfil. | Recovery via verified secondary factor/support. |
| P21-007 | HIGH | Consent | P21 | Termos/privacidade/consentimento de marketing não aparecem como etapa explícita. | Risco legal e de transparência. | Capturar versioned consent. |
| P21-008 | MEDIUM | Age | P21 | Não existe verificação/declaração de idade apesar de dinheiro e creator content. | Menores podem entrar em fluxos inadequados. | Definir age policy e checks. |

## P22 — erros específicos

| ID | Severidade | Tipo | Evidência | Erro | Impacto | Correção necessária |
|---|---|---|---|---|---|---|
| P22-001 | HIGH | Onboarding | P22 | O onboarding descrito como sete passos contém mais tarefas conceituais (tipo, link, foto, nome/bio, oferta, recebimento, identidade, avisos). | Progress indicator não representa esforço real. | Recalcular passos ou agrupar claramente. |
| P22-002 | CRITICAL | Funcional | P22 selections | Várias seleções de tipo, foto, ofertas e notificações não possuem mutations reais. | Onboarding parece configurado sem salvar escolhas. | Controlled form + persisted draft. |
| P22-003 | HIGH | KYC | P22 | Continuar durante análise não define exatamente o que fica bloqueado. | Creator pode parecer apto a receber sem KYC. | Capability gating: publish allowed, paid acceptance/payout conforme policy. |
| P22-004 | HIGH | Pricing | P22 | Primeira oferta usa preços sugeridos/fixos sem explicar Free vs Pro. | Modelo comercial fica contraditório desde o onboarding. | Mostrar 'Preço padrão NaDM'; edição exige Pro. |
| P22-005 | HIGH | Payout | P22 | Meio de recebimento é pedido no onboarding sem fluxo robusto de titularidade. | Payout para número de terceiro/fraude. | Verificar owner/phone conforme provider. |
| P22-006 | MEDIUM | Activation | P22 | Obriga muita configuração antes de valor inicial. | Aumenta abandono; não é redução de escopo, é ordem de ativação. | Permitir salvar e continuar depois, mantendo todas as funções. |
| P22-007 | MEDIUM | Photo | P22 | Escolha/tirar foto não implementa crop, permission, upload ou falha. | Avatar pode não ser salvo. | Media picker real. |
| P22-008 | HIGH | Buyer/Creator | P22 | Conta comprador pode virar creator no futuro, mas não existe fluxo visível de ativação posterior. | Usuário pode achar papéis exclusivos. | Adicionar 'Ativar perfil de criador' no account. |
| P22-009 | MEDIUM | Notifications | P22 | Toggles de avisos parecem configuráveis mas não estão conectados ao centro P28. | Preferências divergem. | Uma única NotificationPreference model. |
| P22-010 | HIGH | Copy Financeira | P22 comprador | Diz que dinheiro dos pedidos fica retido até entrega para qualquer pedido, sem distinguir product type. | Repete erro financeiro sistémico. | Copy por order type. |

## P23 — erros específicos

| ID | Severidade | Tipo | Evidência | Erro | Impacto | Correção necessária |
|---|---|---|---|---|---|---|
| P23-001 | CRITICAL | Upload | P23 fontes | 'Gravar agora' e 'Escolher ficheiro' saltam diretamente para `pronto` sem upload real. | Entrega pode ser marcada pronta sem ficheiro. | Integrar Media pipeline. |
| P23-002 | CRITICAL | Upload | `p23Avancar` | `carregar` pode avançar para `entregue` por clique mesmo sem confirmação de upload. | Cliente recebe estado entregue sem asset. | Somente upload COMPLETED + checksum permite entrega. |
| P23-003 | HIGH | Alteração | P23 | No estado alteração, CTA pode voltar a `pronto` sem gravar/substituir media. | Nova versão pode não existir. | Exigir DeliveryVersion > previous. |
| P23-004 | HIGH | Fees | P23 | 'Recebes 17.100 Kz' hardcoded assume fee. | Pode divergir da order. | Renderizar sellerNet snapshot. |
| P23-005 | HIGH | Decline | P23 | Recusa volta à inbox sem mostrar refund/payment outcome do comprador. | Lado financeiro fica invisível. | Decline -> refund state + notifications. |
| P23-006 | MEDIUM | Deadline | P23 | Prazo é visual e não considera pausa/disputa/alteração como SLA events. | Timer pode continuar errado. | Deadline adjustment policy. |
| P23-007 | HIGH | Security | P23 | Entrega aceita qualquer ficheiro visualmente, sem scan/type constraints. | Malware/formatos ilegíveis. | Validate + scan + transcode. |

## P24 — erros específicos

| ID | Severidade | Tipo | Evidência | Erro | Impacto | Correção necessária |
|---|---|---|---|---|---|---|
| P24-001 | CRITICAL | Funcional | P24 dias | Células de dia não possuem handler. | Utilizador não escolhe dia. | Adicionar selectedDate. |
| P24-002 | CRITICAL | Funcional | P24 horas | Células de horário não possuem handler. | Utilizador não escolhe slot. | Adicionar selectedSlotId. |
| P24-003 | BLOCKER | Fluxo | `p24Avancar` | CTA muda para `escolhido` mesmo sem seleção e depois abre P7 hardcoded para outro produto. | Call pode cobrar valor/produto incorreto. | Slot required -> call Order quote -> payment específico. |
| P24-004 | BLOCKER | Pagamento | P24 -> P7 | Call custa 45.000 Kz, mas P7 exibe fluxo de resposta em vídeo de 18.900 Kz. | Cobrança errada. | P7 deve receber orderId/amount. |
| P24-005 | CRITICAL | Flow completion | P24 | Não existe caminho de volta do pagamento para `confirmada`; P7 vai P8. | Agendamento não chega ao estado confirmado. | Payment success -> booking confirmation. |
| P24-006 | HIGH | Concurrency | P24 | Não existe hold temporário do slot durante pagamento. | Dois clientes podem comprar 14h. | Reserve slot with TTL. |
| P24-007 | HIGH | Cancellation | P24 | Não há reagendamento/cancelamento/no-show. | Call real precisa de lifecycle posterior. | Booking state machine. |
| P24-008 | MEDIUM | Timezone | P24 | Mostra WAT, mas não define conversão para cliente fora de Luanda. | Hora pode ser interpretada errado. | Store timezone and show both when needed. |
| P24-009 | HIGH | Call infra | P24 | 'vídeo na NaDM' é prometido sem fluxo de sala, link, presença, duração e falha. | Produto vendido sem infraestrutura especificada. | Definir video-call provider/session lifecycle. |

## P25 — erros específicos

| ID | Severidade | Tipo | Evidência | Erro | Impacto | Correção necessária |
|---|---|---|---|---|---|---|
| P25-001 | CRITICAL | Routing | P25 order entregue | Pedido 'Entregue' pode abrir P9 `aprovado`, saltando a aprovação pendente. | Pode parecer que fundos já foram liberados. | Abrir P9 according to order.status. |
| P25-002 | MEDIUM | Filter | P25 | 'Sem seguir' aparece como filtro de feed em vez de ser contexto/estado bem definido. | Taxonomia confusa. | Definir filtros por following/free/paid/category. |
| P25-003 | HIGH | Personalization | P25 | Home mistura pedidos e feed sem regra de ordenação/prioridade. | Pedido com prazo pode perder destaque. | Pedidos actionable acima de discovery feed. |
| P25-004 | MEDIUM | Content state | P25 | Feed não mostra claramente entitlement/price state em todos os cards. | Usuário não sabe o que abrirá gratuitamente. | Uniformar content access badges. |
| P25-005 | HIGH | Notifications | P25 -> P27 | Comprador abre P27 e recebe navegação de criador. | Role leakage. | P27 precisa de shell contextual. |

## P26 — erros específicos

| ID | Severidade | Tipo | Evidência | Erro | Impacto | Correção necessária |
|---|---|---|---|---|---|---|
| P26-001 | CRITICAL | Funcional | P26 busca | Campo de busca é representado por termos de variant; não é input real. | Usuário não pode digitar pesquisa dinâmica. | Input + debounced search API. |
| P26-002 | HIGH | Funcional | P26 categorias | Categorias diferentes podem cair no mesmo estado/resultado 'Beleza e estilo'. | Filtro não corresponde à escolha. | Passar categoryId real. |
| P26-003 | CRITICAL | Routing | P26 resultados | Resultados diferentes tendem a abrir o mesmo perfil demo da Nayara. | Pesquisa não navega para o creator correto. | Abrir `/@username`/profileId. |
| P26-004 | MEDIUM | Filter state | P26 | Limpar/toggle de filtros não preserva necessariamente query e demais filtros. | Pesquisa perde contexto. | URL/search params como source of truth. |
| P26-005 | HIGH | Ranking | P26 | Tempo de resposta é tratado como ranking forte sem balancear qualidade, fraude e relevância. | Incentiva respostas rápidas de baixa qualidade. | Ranking multi-sinal auditável. |
| P26-006 | HIGH | Location | P26 | 'Perto de ti' implica geolocalização sem consentimento/permission flow. | Risco de privacidade. | Opt-in location e fallback cidade manual. |
| P26-007 | MEDIUM | No results | P26 | Não há estratégia de correção ortográfica/sinónimos/categorias alternativas. | Busca tem baixa recuperação. | Search suggestions. |
| P26-008 | HIGH | Commercial discovery | P26 | Não distingue creator disponível de creator sem vagas/pausado na ordenação. | Usuário entra em perfis que não podem atender. | Availability signal no ranking/cards. |

## P27 — erros específicos

| ID | Severidade | Tipo | Evidência | Erro | Impacto | Correção necessária |
|---|---|---|---|---|---|---|
| P27-001 | HIGH | Funcional | `p27Limpar` | 'Marcar lidos' muda para estado vazio. | Histórico desaparece visualmente em vez de apenas ficar lido. | Atualizar readAt. |
| P27-002 | CRITICAL | Role | P27 nav | Barra inferior é sempre creator, mesmo quando P27 é aberto pelo comprador. | Mudança de papel involuntária. | Context-aware shell. |
| P27-003 | HIGH | Routing | P27 | Notificações precisam abrir recursos por ID/status; mockup trabalha com destinos estáticos. | Pode abrir pedido errado. | Notification.data com resourceType/resourceId. |
| P27-004 | MEDIUM | Retention | P27 | Não há política de retenção/arquivo de notificações. | Longo prazo vira lista infinita ou some sem regra. | Pagination + retention. |
| P27-005 | MEDIUM | Preferences | P27/P28 | Não há acesso direto claro às preferências por tipo. | Utilizador não controla ruído. | Link para Notification settings. |

## P28 — erros específicos

| ID | Severidade | Tipo | Evidência | Erro | Impacto | Correção necessária |
|---|---|---|---|---|---|---|
| P28-001 | HIGH | Funcional | P28 | Ecrã mostra previews de push/SMS/email, não uma configuração real. | Usuário pode interpretar como preferências. | Separar preview/demo de settings. |
| P28-002 | MEDIUM | SMS rules | P28 | A especificação diz SMS sem acentos/curto, mas exemplos usam vários acentos. | Segmentação GSM pode aumentar número de SMS/custo. | Normalizar copy conforme encoding/política do provider. |
| P28-003 | HIGH | Privacy | P28 | Número e email aparecem hardcoded em exemplos. | Em implementação, PII pode vazar em screenshots/logs. | Mascarar e buscar do account seguro. |
| P28-004 | HIGH | Receipts | P28 | Recibo não mostra estrutura fiscal/legal completa. | Pode não servir para contabilidade. | Invoice/receipt schema conforme entidade legal. |
| P28-005 | HIGH | Delivery | P28 | Não há delivery status, bounce, retry e opt-out por canal. | Notificações podem falhar silenciosamente. | NotificationDelivery entity. |
| P28-006 | MEDIUM | Security messages | P28 | Não diferencia mensagens obrigatórias de segurança de marketing. | Usuário pode desligar o que não deveria ou receber o que recusou. | Categorias mandatory/transactional/marketing. |
| P28-007 | HIGH | Deep links | P28 | SMS/email/push não definem deep links assinados/seguros. | Abrir notificação pode levar a contexto errado ou expirar. | Signed/deferred deep link. |

## P29 — erros específicos

| ID | Severidade | Tipo | Evidência | Erro | Impacto | Correção necessária |
|---|---|---|---|---|---|---|
| P29-001 | CRITICAL | Funcional | `p29Gestao` ~4070 | Todos os itens de gestão, inclusive switches de renovação/aviso, chamam P28 email. | Tocar num switch abre recibos em vez de alternar configuração. | Handlers distintos para renew, reminder e receipts. |
| P29-002 | HIGH | Membership | P29 | Membership tem preço/tier único no mockup. | Não cobre níveis Perto/Mais Perto/Círculo definidos no produto. | MembershipTier configurável. |
| P29-003 | CRITICAL | Billing | P29 | Renovação automática é tratada como garantida. | Pode ser inviável com o PSP escolhido. | Feature flag por payment method capability. |
| P29-004 | HIGH | Entitlement | P29 | Benefício 'uma pergunta escrita por mês' não possui contador de uso/reset. | Pode ser usado ilimitadamente ou bloqueado errado. | BenefitAllowance ledger por billing period. |
| P29-005 | HIGH | Entitlement | P29 | Cancelamento fecha conteúdo de membership, mas relação com biblioteca P11 não é formalizada. | Conteúdo pode continuar aberto ou fechar compra avulsa por engano. | Entitlements separados por source. |
| P29-006 | HIGH | Billing | P29 | Faltam grace period, retry schedule e dunning para cobrança falhada. | Assinatura expira abruptamente ou fica ativa sem pagamento. | Subscription payment lifecycle. |
| P29-007 | MEDIUM | Cancellation | P29 | Não define refund/proration em cancelamento ou upgrade/downgrade. | Billing imprevisível. | Plan change policy. |
| P29-008 | HIGH | Creator control | P29 | Não há editor do lado creator para preço, benefícios, tiers e elegibilidade. | Membership não é gerível. | Criar creator membership management. |
| P29-009 | MEDIUM | Tax | P29 | Recorrência não explicita emissão de recibo por período. | Histórico financeiro incompleto. | Invoice por charge. |

## P30 — erros específicos

| ID | Severidade | Tipo | Evidência | Erro | Impacto | Correção necessária |
|---|---|---|---|---|---|---|
| P30-001 | BLOCKER | Funcional | `p30Qr` ~4094 | O 'QR' é uma matriz visual fixa 11×11, não um QR Code válido. | Não pode ser escaneado como prometido. | Gerar QR padrão a partir da URL com quiet zone e error correction. |
| P30-002 | HIGH | Sharing | P30 | CTAs simulam copiar/Instagram/WhatsApp mudando variants, sem integração real de share sheet/clipboard/deep link. | Fluxo parece concluído sem partilha real. | Web Share API/clipboard/deep links com fallback. |
| P30-003 | HIGH | Analytics | P30 | Visitas e encomendas são exibidas sem definição de atribuição. | Creator pode interpretar correlação como conversão daquele link. | UTM/referral code + attribution window. |
| P30-004 | MEDIUM | QR print | P30 | Copy promete uso impresso sem testar tamanho, contraste, quiet zone e URL lifetime. | Material impresso pode falhar. | Print-safe QR spec. |
| P30-005 | HIGH | Privacy | P30 visitante | Diz que creator só vê número de visitas, mas tracking/anonimização não está formalizado. | Pode contradizer analytics futuro. | Privacy-preserving aggregate analytics. |
| P30-006 | MEDIUM | SEO/Preview | P30 | Não existe definição de Open Graph/social preview por perfil. | Links partilhados podem aparecer pobres/errados. | Dynamic OG metadata. |
| P30-007 | HIGH | Link lifecycle | P30 | Não há regra para username alterado, link antigo, suspensão ou perfil privado. | QR/link pode quebrar. | Permanent profile ID redirects e status-aware landing. |

## Lacunas funcionais obrigatórias

| ID | Severidade | Tipo | Evidência | Erro | Impacto | Correção necessária |
|---|---|---|---|---|---|---|
| MISS-001 | BLOCKER | Eventos | Ausente nos P1–P30 | Criar evento completo | Editor de evento com tipo físico/online/híbrido, data, timezone, local, capacidade, imagem e regras. | Adicionar ao escopo funcional/SDD antes da implementação correspondente. |
| MISS-002 | BLOCKER | Eventos | Ausente nos P1–P30 | Bilhetes | Ticket types, preços, stock, janela de venda, complimentary tickets. | Adicionar ao escopo funcional/SDD antes da implementação correspondente. |
| MISS-003 | BLOCKER | Eventos | Ausente nos P1–P30 | Entrada | QR real por bilhete, attendee list, check-in, duplicate scan e offline fallback. | Adicionar ao escopo funcional/SDD antes da implementação correspondente. |
| MISS-004 | HIGH | Eventos | Ausente nos P1–P30 | Pós-venda | Cancelamento, reagendamento, refund, waitlist e comunicação aos participantes. | Adicionar ao escopo funcional/SDD antes da implementação correspondente. |
| MISS-005 | BLOCKER | NaDM Pro | Ausente nos P1–P30 | Planos da plataforma | Upgrade, checkout, entitlement, renewal, failed payment, cancel e expiry. | Adicionar ao escopo funcional/SDD antes da implementação correspondente. |
| MISS-006 | CRITICAL | NaDM Pro | Ausente nos P1–P30 | Gates | CUSTOM_PRICING, bundles, descontos, advanced analytics, advanced availability e automações. | Adicionar ao escopo funcional/SDD antes da implementação correspondente. |
| MISS-007 | BLOCKER | Admin | Ausente nos P1–P30 | Disputas | Fila, evidence, decisões, partial refund, appeal e audit trail. | Adicionar ao escopo funcional/SDD antes da implementação correspondente. |
| MISS-008 | BLOCKER | Admin | Ausente nos P1–P30 | Financeiro | Reconciliation, payouts, stuck payments, reversals, fees e ledger inspection. | Adicionar ao escopo funcional/SDD antes da implementação correspondente. |
| MISS-009 | CRITICAL | Admin | Ausente nos P1–P30 | KYC/Fraude | Review manual, risk flags, document issues, account freeze/unfreeze. | Adicionar ao escopo funcional/SDD antes da implementação correspondente. |
| MISS-010 | CRITICAL | Admin | Ausente nos P1–P30 | Moderação | Reports de perfil/post/DM, remoção, suspensão, appeal e políticas. | Adicionar ao escopo funcional/SDD antes da implementação correspondente. |
| MISS-011 | CRITICAL | Business | Ausente nos P1–P30 | Workspace da marca | Conta empresa, membros/equipa, permissões, billing profile. | Adicionar ao escopo funcional/SDD antes da implementação correspondente. |
| MISS-012 | CRITICAL | Business | Ausente nos P1–P30 | Campanhas | Criar briefing, procurar creators, shortlist, propostas, approvals e reporting. | Adicionar ao escopo funcional/SDD antes da implementação correspondente. |
| MISS-013 | HIGH | Business | Ausente nos P1–P30 | Faturação | Invoices/receipts/company details/tax data. | Adicionar ao escopo funcional/SDD antes da implementação correspondente. |
| MISS-014 | HIGH | Auth | Ausente nos P1–P30 | Security center | Sessões, dispositivos, logout remoto, MFA/step-up, recovery. | Adicionar ao escopo funcional/SDD antes da implementação correspondente. |
| MISS-015 | HIGH | Pagamentos | Ausente nos P1–P30 | Payment methods | Adicionar/remover/validar método, default, failed method e retry. | Adicionar ao escopo funcional/SDD antes da implementação correspondente. |
| MISS-016 | HIGH | Pagamentos | Ausente nos P1–P30 | Refund/chargeback | Partial, reversal, chargeback, settlement e clawback. | Adicionar ao escopo funcional/SDD antes da implementação correspondente. |
| MISS-017 | HIGH | Wallet | Ausente nos P1–P30 | Payout management | Valor, limites, destino, OTP, status, histórico e falhas. | Adicionar ao escopo funcional/SDD antes da implementação correspondente. |
| MISS-018 | HIGH | Content | Ausente nos P1–P30 | Media management | Uploads resumíveis, transcode, thumbnail, scan, replace e delete rules. | Adicionar ao escopo funcional/SDD antes da implementação correspondente. |
| MISS-019 | HIGH | Content | Ausente nos P1–P30 | Entitlements | Compra permanente, membership, promo, refund revoke e offline. | Adicionar ao escopo funcional/SDD antes da implementação correspondente. |
| MISS-020 | HIGH | DM | Ausente nos P1–P30 | Abuse controls | Block, report, spam throttling, message requests, mute e attachment safety. | Adicionar ao escopo funcional/SDD antes da implementação correspondente. |
| MISS-021 | HIGH | Calls | Ausente nos P1–P30 | Infra de videochamada | Sala, join, reminders, no-show, duration, reconnect e support. | Adicionar ao escopo funcional/SDD antes da implementação correspondente. |
| MISS-022 | MEDIUM | Calls | Ausente nos P1–P30 | Reagendamento | Reschedule/cancel/no-show/refund rules. | Adicionar ao escopo funcional/SDD antes da implementação correspondente. |
| MISS-023 | HIGH | Search | Ausente nos P1–P30 | Backend de pesquisa | Indexação, typo tolerance, filtros, ranking e disponibilidade. | Adicionar ao escopo funcional/SDD antes da implementação correspondente. |
| MISS-024 | HIGH | Notifications | Ausente nos P1–P30 | Preferências | Matrix por canal/tipo, quiet hours e mandatory security. | Adicionar ao escopo funcional/SDD antes da implementação correspondente. |
| MISS-025 | HIGH | Legal | Ausente nos P1–P30 | Termos por transação | Snapshot de direitos de uso, cancelamento e versão dos termos. | Adicionar ao escopo funcional/SDD antes da implementação correspondente. |
| MISS-026 | HIGH | Legal | Ausente nos P1–P30 | Políticas | Privacidade, conteúdo proibido, idade, creator/business terms. | Adicionar ao escopo funcional/SDD antes da implementação correspondente. |
| MISS-027 | HIGH | Responsive | Ausente nos P1–P30 | Desktop/tablet | Layouts próprios e não apenas mobile esticado. | Adicionar ao escopo funcional/SDD antes da implementação correspondente. |
| MISS-028 | HIGH | Accessibility | Ausente nos P1–P30 | AA | Teclado, screen reader, touch target, contraste, focus e reduced motion. | Adicionar ao escopo funcional/SDD antes da implementação correspondente. |

## 6. State machines que devem existir antes do código de produção

### Order

`DRAFT → AWAITING_PAYMENT → PAID → AWAITING_ACCEPTANCE → ACCEPTED → IN_PROGRESS → DELIVERED → COMPLETED`

Saídas adicionais: `DECLINED`, `EXPIRED`, `CANCELLED`, `DISPUTED`, `REFUNDED`, `PARTIALLY_REFUNDED`.

### Payment

`CREATED → PENDING/AUTHORIZED → CAPTURED`

Saídas: `FAILED`, `EXPIRED`, `CANCELLED`, `REFUNDED`, `PARTIALLY_REFUNDED`, `REVERSED`.

**Regra:** a UI nunca pode fabricar `CAPTURED`; só o backend após confirmação verificável do provider.

### Delivery

`NOT_STARTED → WORKING → UPLOADING → DELIVERED → CHANGE_REQUESTED → REDELIVERED → APPROVED`.

### Proposal

`DRAFT → SENT → VIEWED → COUNTERED ↔ COUNTERED → ACCEPTED/REJECTED/EXPIRED`.

Cada revisão deve ser imutável e guardar preço, âmbito, direitos e validade.

### Membership

`PENDING_PAYMENT → ACTIVE → PAST_DUE → GRACE_PERIOD → ACTIVE/EXPIRED/CANCELLED`.

### Payout

`REQUESTED → VALIDATING → PROCESSING → PAID` ou `FAILED/REVERSED`.

### KYC

`NOT_STARTED → SUBMITTED → IN_REVIEW → VERIFIED` ou `REJECTED/NEEDS_RESUBMISSION/EXPIRED`.

## 7. Regras invariantes que o frontend não pode quebrar

1. **Nenhum valor financeiro é confiado ao cliente.** Backend recalcula quote e fee.
2. **Nenhum Payment vira pago por clique local.** Só provider/backend.
3. **Nenhuma vaga é vendida sem reserva transacional.**
4. **Nenhum conteúdo premium abre sem entitlement válido.**
5. **Nenhum Free altera preço customizado.** O backend deve rejeitar mesmo que UI seja burlada.
6. **Nenhum Order concluído muda de preço retroativamente.** Usar snapshots.
7. **Nenhum creator edita/entrega Order de outro creator.** Ownership obrigatório.
8. **Nenhum buyer aprova/liberta fundos por ação cujo rótulo não seja explicitamente aprovação.**
9. **Nenhum upload conta como entregue antes de completar e ser validado.**
10. **Nenhum QR de bilhete/perfil deve ser fake ou puramente visual em produção.**

## 8. Decisões que precisam entrar no SDD v0.2

- State machines formais para Order, Payment, Delivery, Proposal, Refund, Dispute, Membership, Payout e KYC.
- Entitlements de NaDM Pro.
- Pricing Engine e Quote snapshots.
- RefundPolicy por tipo de produto.
- Availability/Slot Hold.
- Event domain completo.
- Business/Brand domain.
- Admin/Operations domain.
- Ledger financeiro e reconciliation.
- Media pipeline.
- Notification preferences/delivery.
- Trust & Safety.
- Responsive specifications.
- Accessibility requirements.
- Legal/terms snapshots.

## 9. Critério de saída desta auditoria

Os mockups podem continuar com **todas as funções atuais e as funções em falta**. A condição para desenvolvimento não é reduzir o produto; é transformar as telas em fluxos que tenham:

- estado de domínio definido;
- ação do utilizador definida;
- validação definida;
- permissão definida;
- API/efeito definido;
- erro/retry definido;
- impacto financeiro definido quando aplicável;
- destino seguinte definido;
- estado alternativo/cancelamento definido;
- teste de aceitação definido.

Somente depois disso cada botão deixa de ser uma representação visual e passa a ser uma funcionalidade especificada.

---

### Nota metodológica

Esta auditoria cobre todos os erros e lacunas **identificáveis nos artefactos fornecidos**. Como os ficheiros são protótipos estáticos e não um backend executável, integrações externas ainda não existentes (PSP, KYC, SMS, storage, videochamada etc.) não podem ser testadas em runtime; por isso foram classificadas como lacunas/requisitos quando aplicável.