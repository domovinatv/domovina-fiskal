-- =========================================================
-- 0006_eracun_doku.sql — Faza 3 (MVP): eRačun 2.0 preko posrednika doku (monoform)
--
-- Model: "BYO-key multitenant" (docs/knowledge/13-provideri-krajolik.md §Razrješenje).
--   * Svaki tenant ima SVOJ doku račun i SVOJ API-TOKEN → doku naplaćuje svakom
--     tenantu direktno (mi nemamo naplatu/reseller ugovor/compliance teret).
--   * Naša integracija se doku-u predstavlja globalnim SOFTWARE-API-TOKEN-om
--     (Env.DOKU_SOFTWARE_API_TOKEN, isti za sve tenante).
--   * doku je pristupna točka: potpisuje i šalje UBL svojim certom, radi AMS
--     discovery i (opcionalno) fiskalizaciju/eIzvještavanje. Mi šaljemo
--     strukturirani JSON (/documents/invoices/outgoing/create) → doku gradi UBL.
--
-- Token se pohranjuje enkriptiran ISTIM envelope postupkom kao certifikati
-- (04-* §7): per-red DEK (AES-256-GCM) omotan KEK-om iz ENC_MASTER_KEY Secreta.
-- =========================================================

-- 1) DOKU KONFIG (per-tenant, po okolini; token nikad plaintext)
CREATE TABLE doku_konfig (
  id               INTEGER PRIMARY KEY,
  tenant_id        INTEGER NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  okolina          TEXT NOT NULL CHECK (okolina IN ('test','prod')),
  token_encrypted  TEXT NOT NULL,            -- API-TOKEN vrijednost, AES-256-GCM (hex)
  enc_alg          TEXT NOT NULL DEFAULT 'AES-256-GCM',
  enc_key_id       TEXT NOT NULL,            -- referenca na KEK secret, NE ključ
  enc_iv           TEXT NOT NULL,            -- IV podataka (hex)
  dek_wrapped      TEXT NOT NULL,            -- DEK omotan KEK-om (hex)
  dek_iv           TEXT NOT NULL,            -- IV omatanja DEK-a (hex)
  token_prefiks    TEXT,                     -- vidljivi prefiks tokena (identifikacija u adminu)
  ams_registriran  INTEGER NOT NULL DEFAULT 0, -- je li tenant objavljen na AMS-u za ZAPRIMANJE
  aktivan          INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, okolina)
);
CREATE INDEX ix_doku_tenant ON doku_konfig(tenant_id);

-- 2) RAČUN — operativna polja slanja eRačuna preko doku-a
--    (odvojeno od B2C fiskalizacije 1.0 iz 0004; eRačun 2.0 ide drugim kanalom)
ALTER TABLE racun ADD COLUMN doku_id INTEGER;                 -- id dokumenta u doku-u (izlazni)
ALTER TABLE racun ADD COLUMN eracun_status TEXT;              -- IMPORTED | FISCALIZED | DELIVERED (doku exchange.status)
ALTER TABLE racun ADD COLUMN eracun_delivery_block TEXT;      -- 'AMS' kad primatelj nije registriran za eDelivery
ALTER TABLE racun ADD COLUMN eracun_zadnja_provjera TEXT;     -- ISO ts zadnjeg GET statusa
ALTER TABLE racun ADD COLUMN eracun_greska TEXT;              -- zadnja greška slanja (transport/doku poruka)

-- Sweep osvježavanja statusa: poslani eRačuni koji još nisu DELIVERED.
CREATE INDEX ix_racun_eracun_ceka ON racun(tenant_id, id)
  WHERE doku_id IS NOT NULL AND eracun_status IS NOT 'DELIVERED';
