-- =========================================================
-- 0013 — BYO backup po tenantu (docs/knowledge/23-backup.md §Razina 2)
-- Tenant opcionalno unese svoj Cloudflare account ID, R2 bucket i API token
-- (Workers R2 Storage: Edit, samo na taj bucket). Mi u njegov bucket šaljemo
-- svaki račun čim se promijeni (JSON + PDF) i dnevni snapshot svih njegovih
-- podataka. Token je šifriran kao doku token (envelope, KEK).
-- =========================================================
CREATE TABLE tenant_backup (
  id                    INTEGER PRIMARY KEY,
  tenant_id             INTEGER NOT NULL UNIQUE REFERENCES tenant(id) ON DELETE CASCADE,
  cf_account_id         TEXT NOT NULL,             -- 32 hex
  bucket                TEXT NOT NULL,
  jurisdikcija          TEXT,                      -- NULL (default) | 'eu' | 'fedramp'
  prefiks               TEXT NOT NULL DEFAULT 'domovina-fiskal/',
  token_encrypted       TEXT NOT NULL,             -- AES-256-GCM (hex)
  enc_alg               TEXT NOT NULL DEFAULT 'AES-256-GCM',
  enc_key_id            TEXT NOT NULL,
  enc_iv                TEXT NOT NULL,
  dek_wrapped           TEXT NOT NULL,
  dek_iv                TEXT NOT NULL,
  token_prefiks         TEXT,
  aktivan               INTEGER NOT NULL DEFAULT 1,
  sinkronizirano_do     TEXT,                      -- vodeni žig: racun.updated_at zadnjeg poslanog
  zadnja_sinkronizacija TEXT,                      -- zadnji USPJEŠAN upis računa
  zadnji_snapshot       TEXT,                      -- zadnji uspješan dnevni snapshot (ključ objekta)
  zadnja_greska         TEXT,                      -- NULL nakon svakog uspjeha
  zadnja_greska_ts      TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sinkronizacija čita račune po updated_at.
CREATE INDEX IF NOT EXISTS ix_racun_tenant_updated ON racun(tenant_id, updated_at);
