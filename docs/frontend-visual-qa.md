# Frontend — alinhamento com o mockup

> Histórico da pasta (1). A referência actual é a pasta (2); ver
> [actualização do design](design-v2.md).

Referência: `design/Design de app personalizado (1)/NaDMScreen.dc.html`,
P1–P36. Revisão de 21-09-2026. A referência é o conteúdo dos ecrãs, não o
bezel, a barra de estado nem o menu do catálogo `NaDM Mobile.dc.html`.

## Implementado nesta passagem

- Base partilhada: coluna de 390px, tokens claros corrigidos, ícones SVG,
  cabeçalhos compactos, cápsulas activas da navegação e folhas modais nativas.
- P21/P22: composição de entrada com métodos separados, telefone em estado
  próprio, demonstração em folha e selecção de papel/progresso no onboarding.
- P12/P13: destaque de saldo, métricas reais, fila compacta, pesquisa e grupos
  de pedidos; ferramentas secundárias num bloco expansível.
- P15/P16: tipos de publicação com ícones, visibilidade segmentada, editor
  de oferta existente e preço em destaque com atalhos que alteram o formulário.
- P18/P19: carteira, folha de levantamento indisponível e gráfico/indicadores
  calculados a partir dos pedidos reais. Valores continuam em BigInt.
- P20: cabeçalho e filtros, ligação pública, `?tab=account` funcional;
  o perfil público passa a respeitar a ordem guardada dos separadores.
- P1/P26: confiança e avaliações reais, categorias, pesquisa e filtros.
- P36: página de segurança, explicação dos limites da demonstração e saída
  deste aparelho. Corrigida a corrida entre a saída e o redireccionamento de
  rotas privadas, que podia inserir `/seguranca` como destino da entrada seguinte.
- Rascunho local da publicação continua disponível quando o serviço responde
  404; a interface deixa de expor `Cannot GET`. Não há confirmação de publicação.

## Verificação

`npm run lint`, `npm test` e `npm run test:scripts`: 329 testes passaram
(253 API + 61 frontend + 15 scripts). Inclui precisão monetária acima do limite
seguro de Number e valores com cêntimos após a mudança de apresentação de Kz.

Build de produção concluído com sucesso numa cópia em
`/tmp/nadm-web-build.fhsNOM` (dois workers), preservando o `.next` do servidor
de desenvolvimento. Todas as rotas foram compiladas e 23 páginas estáticas
foram geradas. Isto valida o frontend, não disponibiliza autenticação de produção.

Capturas verificadas a 375/390px, 768px e 1440px, nos dois temas. As capturas
concluídas não apresentaram excepções JavaScript nem overflow horizontal.
Não é uma afirmação de equivalência pixel a pixel de todos os 36 ecrãs/estados.

O ensaio interactivo passou, cobrindo número inválido/válido, folha de SMS indisponível,
Escape, entrada de criador, oferta existente, alteração de preço sem gravar,
carteira → Conta, reordenação local, rascunho após recarregar, pesquisa vazia,
limpar filtros, saída e entrada de espectador. Não submete alterações de
perfil/ofertas nem pedidos, pagamentos ou publicações.

HTTP a distinguir de regressões visuais:

- `/api/profiles/me` devolve 404 para o espectador sem perfil de criador:
  estado esperado e tratado pela sessão.
- `/api/profiles/:handle/content` e `/api/profiles/me/content` devolvem 404:
  integração de conteúdo ainda em falta. Não contar como testes de rede verdes.
- As rotas de estúdio capturadas com dados (ofertas, perfil, carteira, caixa,
  números e segurança) não apresentaram falhas HTTP.

Verificação básica de rótulos e landmarks nas últimas capturas: um `main`,
sem imagens sem `alt` e sem controlos sem nome nas páginas verificadas.
Escape da folha foi testado. Isto não substitui auditoria WCAG com leitor de
ecrã/axe; LCP, CLS e INP de produção não foram medidos.

## Auditoria visual dirigida

Pontuações qualitativas da amostra revista, não métricas de equivalência.

| Dimensão | /10 | Evidência e limite |
|---|---|---|
| Paleta | 9 | `apps/web/src/app/globals.css:11`; tokens do mockup e texto lime separado no claro |
| Tipografia | 9 | `apps/web/src/components/studio-nav.tsx:7`; títulos 21px, pesos e números tabulares |
| Espaçamento | 8 | `apps/web/src/components/screen.tsx:13`; cabeçalho, corpo e rodapé consistentes; restantes fluxos por comparar |
| Componentes | 8 | `apps/web/src/components/icon.tsx:41`; ícones partilhados, ainda há páginas antigas fora da amostra |
| Responsividade | 9 | `apps/web/src/components/app-frame.tsx:37`; canvas limitado e centrado, sem overflow nas capturas |
| Temas | 9 | `apps/web/src/app/globals.css:35`; capturas claras/escuras, contraste dos CTAs escuros corrigido |
| Movimento | 8 | `apps/web/src/app/globals.css:304`; redução de movimento preservada; não houve auditoria de todas as animações |
| Acessibilidade | 7 | `apps/web/src/components/app-sheet.tsx:5`; dialog nativo, Escape, foco visível; auditoria completa pendente |
| Densidade | 8 | `apps/web/src/app/estudio/page.tsx:33`; saldo/fila antes das ferramentas; dados reais alteram alturas |
| Acabamento | 8 | `apps/web/src/app/estudio/publicar/page.tsx:32`; estados indisponíveis compreensíveis e rascunho local |

## Reproduzir

Com `npm run dev` já saudável, Chrome instalado e Node com WebSocket nativo:

```sh
node scripts/visual-qa.mjs app /entrar 375 light
node scripts/visual-qa.mjs app /estudio 390 dark creator
node scripts/visual-qa.mjs app /descobrir 768 light buyer
node scripts/visual-qa.mjs app /entrar 1440 dark
node scripts/visual-qa.mjs reference p21 390 dark
node scripts/visual-qa.mjs flow /entrar 390 dark
```

Cada execução cria um navegador headless com perfil temporário e porta livre;
não usa o navegador pessoal nem deixa os dados de teste no perfil do utilizador.
Capturas e relatórios JSON ficam em `/tmp/nadm-design-qa`.

## Ainda por concluir

Fidelidade dos restantes fluxos/estados e integrações de conteúdo/media, SMS e
OAuth, levantamentos, adesões, bilheteira, workspace de marca e moderação.
P32/P34/P35 ainda não têm páginas implementadas; P28 depende de canais externos.
Os números, imagens e nomes fictícios do catálogo não foram inseridos na base
de dados para preencher os ecrãs. Mapa completo em `.interface-design/system.md`.
