-- =========================================================
-- 0014_dashboard_passkey.sql — prijava u customer dashboard passkeyem i pozivnicom
--   (umjesto GoTrue). Plan: docs/passkey/plan.md, odluke 5–8 i 100+ u
--   docs/passkey/decisions.md. Uzor: 0010_admin_prijava.sql i logomedo.com
--   migrations/0032_korisnici_uloge.sql, 0033_pozivi_aktivnost.sql.
--
--   Tablice su namjerno odvojene od admin_* (odluka 5): passkey dashboarda ne
--   otvara /admin i obrnuto. Veza s tenantima ostaje po e-mailu:
--   lower(korisnik_tenant.user_email) = korisnik.email (odluka 6).
-- =========================================================

-- Identitet korisnika dashboarda. E-mail se uvijek upisuje malim slovima (CHECK),
-- pa je UNIQUE na stupcu ujedno jedinstvenost „u lower”.
CREATE TABLE korisnik (
  id          INTEGER PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE CHECK (email = lower(trim(email)) AND email <> ''),
  ime         TEXT,
  aktivan     INTEGER NOT NULL DEFAULT 1 CHECK (aktivan IN (0, 1)),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE korisnik_passkeys (
  id            TEXT PRIMARY KEY,         -- credential ID, base64url
  korisnik_id   INTEGER NOT NULL REFERENCES korisnik(id) ON DELETE CASCADE,
  public_key    TEXT NOT NULL,            -- COSE, base64url; privatni ključ nikad ne napušta uređaj
  counter       INTEGER NOT NULL DEFAULT 0,
  transports    TEXT,
  label         TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  last_used_at  TEXT
);
CREATE INDEX ix_korisnik_passkeys_korisnik ON korisnik_passkeys (korisnik_id);

-- U bazi samo sha-256 tokena iz kolačića __Host-fiskal_app: tko dobije bazu, ne dobije sesiju.
CREATE TABLE korisnik_sesije (
  token_hash    TEXT PRIMARY KEY,
  korisnik_id   INTEGER NOT NULL REFERENCES korisnik(id) ON DELETE CASCADE,
  method        TEXT NOT NULL CHECK (method IN ('passkey', 'poziv')),
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,            -- 12 h
  user_agent    TEXT,
  last_seen_at  TEXT                      -- sesija završava nakon 2 h neaktivnosti
);
CREATE INDEX ix_korisnik_sesije_korisnik ON korisnik_sesije (korisnik_id);

-- WebAuthn izazovi: jednokratni, 5 min. 'register' veže korisnika (dodavanje passkeya
-- prijavljenom), 'poziv' veže pozivnicu, 'login' nije vezan (discoverable ključ).
CREATE TABLE korisnik_izazovi (
  challenge     TEXT PRIMARY KEY,
  purpose       TEXT NOT NULL CHECK (purpose IN ('login', 'register', 'poziv')),
  korisnik_id   INTEGER,
  poziv_id      INTEGER,
  expires_at    TEXT NOT NULL
);

-- Pozivnice: u bazi samo sha-256 tokena iz linka (/app/poziv#<token>), 72 h, jednokratne,
-- troše se tek uspješnim upisom passkeya (odluka 7). Dvije vrste:
--   * za tenant: tenant_id + uloga, korisnik_id NULL (novi ili postojeći korisnik ulazi u tenant);
--   * novi passkey postojećem korisniku: korisnik_id, bez tenanta i uloge.
-- Vlasnik smije pozivati samo knjigovođu i operatera (odluka 4) — pravilo je u shemi.
CREATE TABLE pozivnice (
  id             INTEGER PRIMARY KEY,
  token_hash     TEXT NOT NULL UNIQUE,
  email          TEXT NOT NULL CHECK (email = lower(trim(email)) AND email <> ''),
  ime            TEXT,
  tenant_id      INTEGER REFERENCES tenant(id) ON DELETE CASCADE,
  uloga          TEXT CHECK (uloga IN ('vlasnik', 'knjigovodja', 'operater')),
  korisnik_id    INTEGER REFERENCES korisnik(id) ON DELETE CASCADE,
  stvorio        TEXT NOT NULL,                     -- e-mail admina ili vlasnika
  stvorio_tip    TEXT NOT NULL CHECK (stvorio_tip IN ('admin', 'vlasnik')),
  created_at     TEXT NOT NULL,
  istjece        TEXT NOT NULL,
  iskoristena_at TEXT,
  passkey_id     TEXT,                              -- korisnik_passkeys.id nastao iz ove pozivnice
  opozvana_at    TEXT,
  CHECK ((tenant_id IS NOT NULL AND uloga IS NOT NULL AND korisnik_id IS NULL)
      OR (tenant_id IS NULL AND uloga IS NULL AND korisnik_id IS NOT NULL)),
  CHECK (stvorio_tip = 'admin' OR (tenant_id IS NOT NULL AND uloga IN ('knjigovodja', 'operater')))
);
CREATE INDEX ix_pozivnice_email ON pozivnice (email);
CREATE INDEX ix_pozivnice_tenant ON pozivnice (tenant_id);
