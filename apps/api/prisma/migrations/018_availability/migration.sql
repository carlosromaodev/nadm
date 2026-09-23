-- F7 · disponibilidade, vagas e agendamento.
--
-- Uma oferta `BOOKING` tem janelas com vagas. Duas regras precisam do Postgres
-- porque protegem contra concorrência, e uma verificação em aplicação perde a
-- corrida por construção: janelas da mesma oferta não se sobrepõem (RN-033), e
-- `slots_taken` nunca passa `slots_total` (RN-031).

-- `btree_gist` é o que permite misturar igualdade (`offer_id`) com
-- sobreposição de intervalos (`&&`) na mesma restrição de exclusão.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE "availability_windows" (
  "id"          UUID PRIMARY KEY,
  "profile_id"  UUID NOT NULL REFERENCES "profiles"("id") ON DELETE RESTRICT,
  "offer_id"    UUID NOT NULL REFERENCES "offers"("id") ON DELETE RESTRICT,
  "starts_at"   TIMESTAMPTZ(3) NOT NULL,
  "ends_at"     TIMESTAMPTZ(3) NOT NULL,
  "slots_total" INTEGER NOT NULL CHECK ("slots_total" > 0),
  "slots_taken" INTEGER NOT NULL DEFAULT 0 CHECK ("slots_taken" >= 0),
  "timezone"    TEXT NOT NULL DEFAULT 'Africa/Luanda',
  "created_at"  TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMPTZ(3) NOT NULL
);

ALTER TABLE "availability_windows"
  ADD CONSTRAINT "availability_windows_range_is_forward" CHECK ("ends_at" > "starts_at");

-- RN-031 — as vagas ocupadas nunca passam as que existem. O `UPDATE` que
-- reserva já filtra por `slots_taken < slots_total`; esta restrição é a rede
-- por baixo, para o caso de aparecer outro caminho de escrita.
ALTER TABLE "availability_windows"
  ADD CONSTRAINT "availability_windows_slots_within_total"
  CHECK ("slots_taken" <= "slots_total");

-- RN-033 — duas janelas da mesma oferta não podem cobrir o mesmo instante.
--
-- `[)` fecha o início e abre o fim: uma janela que acaba às 14h e outra que
-- começa às 14h **não** se sobrepõem, que é o que qualquer pessoa espera ao
-- marcar dois trabalhos seguidos.
ALTER TABLE "availability_windows"
  ADD CONSTRAINT "availability_windows_no_overlap"
  EXCLUDE USING gist (
    "offer_id" WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  );

-- A janela reservada fica no `Deal`, para a vaga poder ser devolvida quando o
-- pedido morre antes de haver trabalho.
ALTER TABLE "deals"
  ADD COLUMN "window_id" UUID REFERENCES "availability_windows"("id") ON DELETE RESTRICT;

CREATE INDEX "deals_window_id_idx" ON "deals" ("window_id") WHERE "window_id" IS NOT NULL;

-- Uma janela apaga-se enquanto não tiver reservas; depois disso é histórico.
GRANT SELECT, INSERT, UPDATE, DELETE ON "availability_windows" TO nadm_app;
