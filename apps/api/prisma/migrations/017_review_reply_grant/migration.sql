-- A migração 016 deu `UPDATE ("reply", "replied_at")` ao papel da aplicação, e
-- faltou uma coluna: `updated_at`.
--
-- O modelo tem `@updatedAt`, o que faz o Prisma escrever `updated_at` em **todo**
-- o `UPDATE`. Sem privilégio nessa coluna, o Postgres recusa a instrução inteira
-- e responde com uma negação ao nível da tabela, que é enganador de ler.
--
-- Fica em migração nova e não corrigida na 016 de propósito: a 016 já foi
-- aplicada, e reescrever uma migração aplicada quebra a soma de verificação de
-- quem já a correu.

GRANT UPDATE ("reply", "replied_at", "updated_at") ON "reviews" TO nadm_app;
