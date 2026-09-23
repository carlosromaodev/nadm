-- F3 · a oferta que desbloqueia uma publicação paga (UC-09).
--
-- Comprar conteúdo é comprar como tudo o resto na NaDM: um `Deal`, com escrow,
-- razão e conversa. E um `Deal` precisa de uma `Offer` — por isso publicar
-- conteúdo pago passa a criar a oferta correspondente, com o preço da
-- publicação.
--
-- A oferta é do sistema, não do criador: ele põe o preço na publicação, e não
-- gere duas coisas para vender uma.

ALTER TABLE "offers"
  ADD COLUMN "content_item_id" UUID REFERENCES "content_items"("id") ON DELETE RESTRICT;

-- Uma publicação tem no máximo uma oferta que a desbloqueia. Sem isto, dois
-- caminhos de publicação criariam duas ofertas para o mesmo conteúdo, e o
-- comprador via o mesmo item duas vezes com preços possivelmente diferentes.
CREATE UNIQUE INDEX "offers_content_item_id_idx"
    ON "offers" ("content_item_id")
 WHERE "content_item_id" IS NOT NULL;

-- Só uma oferta de desbloqueio aponta para conteúdo, e toda a que aponta é de
-- desbloqueio.
ALTER TABLE "offers"
  ADD CONSTRAINT "offers_content_unlock_has_item"
  CHECK (
    ("kind" = 'CONTENT_UNLOCK' AND "content_item_id" IS NOT NULL)
    OR ("kind" <> 'CONTENT_UNLOCK' AND "content_item_id" IS NULL)
  );
