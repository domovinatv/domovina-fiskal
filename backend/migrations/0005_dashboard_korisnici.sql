-- =========================================================
-- 0005_dashboard_korisnici.sql — Dashboard za krajnje korisnike (SSO)
--   Identitet živi u dijeljenom GoTrue-u (api.domovina.ai); ovdje živi SAMO
--   autorizacija: koji korisnik → koji tenant, s kojom ulogom.
--   Superuser dodaje pristup po EMAILU (ne zna GoTrue sub); `user_id` se veže
--   na prvoj prijavi (email iz JWT-a je verificiran → siguran bootstrap).
--   Vidi docs/knowledge/16-dashboard-sso.md §4.
-- =========================================================

CREATE TABLE korisnik_tenant (
  id          INTEGER PRIMARY KEY,
  tenant_id   INTEGER NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  user_email  TEXT NOT NULL,              -- ono što superuser unese u /admin
  user_id     TEXT,                       -- GoTrue sub (uuid); NULL dok se ne veže
  uloga       TEXT NOT NULL DEFAULT 'vlasnik'
                CHECK (uloga IN ('vlasnik','knjigovodja','operater')),
  aktivan     INTEGER NOT NULL DEFAULT 1,
  bound_at    TEXT,                        -- kad je user_id vezan (prva prijava)
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX ux_kt_tenant_email ON korisnik_tenant(tenant_id, lower(user_email));
CREATE INDEX ix_kt_user_id ON korisnik_tenant(user_id);
CREATE INDEX ix_kt_user_email ON korisnik_tenant(lower(user_email));
