-- =========================================================
-- 0016 — Vlastiti pošiljatelj e-maila po tenantu (BYO Resend)
-- Tenant opcionalno unese svoj Resend API ključ i adresu pošiljatelja na svojoj
-- (u Resendu verificiranoj) domeni, npr. financije@prilikazasusret.hr. Računi
-- tada idu s te adrese; ako slanje njegovim ključem ne uspije, ide zadanim
-- kanalom platforme (racuni@domovina.ai, reply-to = tenant). Ključ je šifriran
-- kao doku/backup token (envelope, KEK).
-- =========================================================
CREATE TABLE tenant_email (
  id                    INTEGER PRIMARY KEY,
  tenant_id             INTEGER NOT NULL UNIQUE REFERENCES tenant(id) ON DELETE CASCADE,
  posiljatelj_email     TEXT NOT NULL,             -- malim slovima
  posiljatelj_ime       TEXT,                      -- NULL → naziv tenanta
  token_encrypted       TEXT NOT NULL,             -- Resend API ključ, AES-256-GCM (hex)
  enc_alg               TEXT NOT NULL DEFAULT 'AES-256-GCM',
  enc_key_id            TEXT NOT NULL,
  enc_iv                TEXT NOT NULL,
  dek_wrapped           TEXT NOT NULL,
  dek_iv                TEXT NOT NULL,
  token_prefiks         TEXT,
  domena_provjerena     INTEGER NOT NULL DEFAULT 0, -- 1 = ključ je pokazao domenu kao verified
  aktivan               INTEGER NOT NULL DEFAULT 1,
  zadnje_slanje         TEXT,                      -- zadnji USPJEŠAN mail tenantovim ključem
  zadnja_greska         TEXT,                      -- NULL nakon svakog uspjeha
  zadnja_greska_ts      TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
