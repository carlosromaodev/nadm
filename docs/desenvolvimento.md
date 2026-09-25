# Arrancar o NaDM

Requisitos: Node.js 20.12 ou superior, dependências instaladas (`npm ci`), Docker
com Compose e, para partilhar, ngrok já autenticado nesta máquina.

```sh
npm run dev          # Postgres, Prisma, migrações, API e frontend
npm run dev:full     # O mesmo + ngrok sem palavra-passe
npm run dev:check    # Verifica frontend, API e proxy
```

**Também se arranca de dentro do backend.** `npm run dev` em `apps/api` levanta
o projecto inteiro — Postgres, migrações, API, frontend **e o túnel do ngrok**.
É o mesmo que `npm run dev:full` na raiz, e existe porque o directório do
backend é onde se está a trabalhar quando se quer ver o resultado no telemóvel.

Para correr só a API, sem Docker nem migrações: `npm run dev:api` na raiz.

O frontend fica em **http://localhost:3001**, a API em
**http://127.0.0.1:3333/api** e o Postgres na porta **5436**.
A porta 3000 continua livre para outros projetos.

O comando prepara os ficheiros `.env` a partir dos exemplos apenas se estiverem
ausentes; não substitui configurações existentes. Aguarda a saúde do Postgres,
gera o Prisma Client, aplica migrações com `migrate deploy` e só anuncia
“NaDM pronto” depois de verificar as duas aplicações e o proxy.

Não faz reset, não apaga dados e não executa o seed automaticamente.
Para preparar sem iniciar servidores: `npm run dev:setup`.
Se a base já for gerida fora do Docker: `npm run dev -- --no-docker`.

## Arranque repetido e portas ocupadas

Instâncias saudáveis que se identificam como NaDM são reutilizadas, sem criar
servidores duplicados. Uma porta ocupada por outra aplicação, ou um serviço que
não fica saudável, produz um erro explícito. O comando não mata esse processo
nem muda a porta silenciosamente. Ctrl+C encerra apenas os servidores que esse
comando iniciou; instâncias reutilizadas e o Postgres continuam ativos.

Verificações de saúde: `/health` no frontend e `/api/health` na API.
A API só fica pronta se conseguir consultar a base de dados.

Dentro de `apps/web`, `npm run dev` inicia apenas o frontend ou reutiliza o
NaDM já ativo na porta 3001. É equivalente a `npm run dev:web` na raiz; não
inicia Docker nem aplica migrações. Se a API não estiver disponível, mostra
como iniciar o projeto completo.

**`dev` orquestra, `dev:server` corre.** Em ambos os workspaces, `dev` é o
comando do dia a dia e chama `scripts/dev.mjs`; `dev:server` é o servidor em si
— `next dev` e `nest start --watch` — e é o único que o orquestrador lança.
Lançar `dev` a partir dele punha-o a chamar-se a si próprio, sem fim, e há um
teste em `scripts/dev.spec.mjs` que trava essa inversão.

## Funções ngrok trazidas do Bizy

Foram adaptados os mesmos quatro pontos de entrada dos scripts em
`/home/carlos/Documentos/project/bizy/scripts`:

| Script | Comando equivalente no NaDM |
| --- | --- |
| `dev-full.sh` | `npm run dev:full` |
| `setup-ngrok.sh` | `npm run ngrok` |
| `setup-ngrok-domain.sh dominio` | `npm run ngrok:domain -- dominio` |
| `update-ngrok-url.sh` | `npm run ngrok:url` |

Também podem ser chamados diretamente com `bash scripts/<nome>.sh`.

O ngrok corre em segundo plano, reutiliza a conta já configurada na máquina e
guarda PID, logs e URL em `.ngrok/` (ignorada pelo Git).
`npm run ngrok:stop` termina apenas o agente comprovadamente iniciado por este
projeto. Um túnel de outro projeto nunca é terminado automaticamente.

O túnel existente do NaDM é reutilizado. A sincronização escolhe o destino
**3001**, e não o primeiro URL de outro projeto, e atualiza `APP_PUBLIC_URL`
nos ficheiros locais de configuração. Os restantes valores são preservados.
Não são trazidas integrações Evolution/WhatsApp/Redis do Bizy, que não pertencem
a este projeto.

Para domínio reservado use `npm run ngrok:domain -- seu-dominio.ngrok-free.app`,
ou configure `NADM_NGROK_URL` / `NGROK_DOMAIN` no `.env` da raiz.
Antes de trocar um domínio ativo, execute `npm run ngrok:stop`.

O browser chama `/api` no mesmo domínio, tanto localmente como pelo ngrok.
O Next encaminha para `API_INTERNAL_URL`, sem expor localhost ao telemóvel do
visitante. Não é necessário alterar CORS a cada túnel.

## Acesso público à demonstração

Por decisão do utilizador, o túnel não exige login nem palavra-passe do ngrok.
Qualquer pessoa com o link pode aceder ao frontend e à API de desenvolvimento.
Isto não remove o ecrã de entrada da aplicação nem acrescenta autenticação real.
Não use este túnel com dados sensíveis ou como ambiente de produção.
Ficheiros antigos de credenciais/política em `.ngrok/` já não são carregados.
Não são copiados tokens nem alterada a conta ngrok dos outros projetos.
A inspeção de pedidos do ngrok fica desligada para não guardar corpos de pedidos.

Por omissão, o túnel continua ativo depois de Ctrl+C. Para encerrar também o
túnel criado pelo arranque completo, use
`STOP_NGROK_ON_EXIT=true npm run dev:full`.

Isto não é autenticação de produção. SMS, provedores sociais, KYC e cobranças
reais ainda dependem das integrações correspondentes. O adaptador de autenticação
`dev` continua proibido com `NODE_ENV=production`.

## Verificar os scripts

`npm run test:scripts` testa seleção do túnel, validação de domínio e atualização
das variáveis sem alterar configurações alheias. `npm run dev:check` verifica os
serviços reais em execução.
