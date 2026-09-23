# Actualização do design — ZIP (2)

Referência recebida em 22-09-2026: `design/Design de app personalizado (2).zip`.
Extraída sem substituir a pasta (1). O catálogo passa de 36 para **37 ecrãs**.
Inclui `NaDM Especificacao.dc.html`, com taxas e máquinas de estado; não é uma
rota do produto nem autorização para simular operações financeiras.

## Diferenças implementadas

| Mockup | Implementação |
|---|---|
| Navegação única por contexto | Criador: Painel / Caixa / Criar / Perfil; espectador: Início / Descobrir / DM / Meu |
| P12, ferramentas no painel | Grelha com Ofertas, Agenda, Carteira, Números, Publicar e Eventos; estados derivados dos dados disponíveis |
| P13, resumo da caixa | A decidir / A entregar / Retido, com ligações aos filtros e à carteira |
| P20, centro de controlo | `/definicoes`, acessível pela engrenagem do painel/início; 12 áreas com resumo de estado |
| P20, aparência | `/definicoes?area=aparencia`; Sistema, Claro e Escuro, persistência local e actualização quando o sistema muda |
| P20, modo de utilização | Troca criador/espectador mantendo a conta; a raiz respeita o modo escolhido |
| P37, Mimar | `/{handle}/mimar`, acessível pela DM; seis valores, mensagem, visibilidade e revisão da estimativa |
| Tema claro | Fundo `#eef2e6`, tinta `#15261c`, superfície secundária `#e2e8d6`, contornos e texto secundário da versão (2) |

As áreas de conta, privacidade, notificações, disponibilidade, conteúdo,
pagamentos e segurança levam aos controlos já existentes. O editor
`/estudio/perfil?tab=…` continua acessível para preservar as ligações antigas.
Os detalhes de todas as 12 áreas ainda não reproduzem todos os controlos do
mockup; por exemplo, horários de silêncio, palavras bloqueadas e gestão remota
de sessões continuam por integrar. Ajuda contém informação navegável, não um
pedido de suporte falsamente enviado.

O modo Empresa mostra explicitamente que está indisponível, sem trocar a
identidade. Não há workspace de marca nem campanhas fictícias.

## Mimos: limite funcional

A selecção e a revisão funcionam localmente. A estimativa usa valores inteiros
em cêntimos e 5% de cada lado, para o exemplo de plano gratuito. Exemplo:
5 000 Kz de apoio → 5 250 Kz para o comprador e 4 750 Kz para o criador.

**Não há cobrança, envio, recibo ou confirmação “Mimo enviado”.** O backend
deverá definir e autorizar a cotação e o ciclo do apoio livre; não se reutilizou
o briefing/entrega de um serviço para fingir esse fluxo. O estado vindo de uma
publicação e os estados financeiros P37 ainda precisam da integração real.

## Verificação

- TypeScript sem erros; 253 testes API, 64 frontend e 15 scripts passaram.
- Build de produção concluído numa cópia temporária, sem interromper o servidor;
  as novas rotas foram compiladas e 24 páginas estáticas geradas.
- Capturas de Definições e Mimar a 375px: sem excepções JavaScript, falhas HTTP,
  overflow horizontal ou controlos sem nome nas verificações básicas.
- Capturas adicionais: Definições a 768px/claro e Mimar a 1440px/escuro,
  sem falhas JavaScript/HTTP nem overflow.
- Ensaio interactivo aprovado: barra fixa, seis atalhos, doze áreas,
  persistência do tema, resposta ao tema do sistema, troca de contexto na mesma
  conta, entrada na rota de mimo e revisão dos valores sem cobrança. Corrigida
  a corrida de carregamento que podia abrir onboarding ao regressar a Criador.
- Ensaio reproduzível, sem gravar perfis nem efectuar pagamentos:

```sh
node scripts/visual-qa.mjs update /estudio 390 dark creator
node scripts/visual-qa.mjs reference p20 375 dark hub
node scripts/visual-qa.mjs reference p37 375 light escolher
```

O script de comparação passou a ler a pasta (2). As capturas ficam em
`/tmp/nadm-design-qa`. Os resultados da passagem anterior, relativos à pasta
(1), permanecem em `docs/frontend-visual-qa.md` como histórico.
