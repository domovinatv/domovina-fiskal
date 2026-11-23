-- =========================================================
-- 0015_korisnik_aktivnost.sql — trag radnji nad pozivnicama i korisnicima dashboarda
--   (docs/passkey/, S3, odluka 300). Do sada fiskal nije imao tablicu aktivnosti;
--   uzor je logomedo.com `aktivnost` (radnje `poziv.*`, `korisnik.*`), ali bez
--   poništavanja i bez prije/poslije: ovo je samo trag tko je što napravio i kada.
--
--   Namjerno bez stranih ključeva: zapis ostaje i kad tenant, korisnik ili pozivnica
--   nestanu (ON DELETE CASCADE na tim tablicama). Samo INSERT, nikad UPDATE/DELETE.
-- =========================================================

CREATE TABLE korisnik_aktivnost (
  id            INTEGER PRIMARY KEY,
  at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  tko           TEXT NOT NULL,              -- e-mail administratora ili vlasnika; 'skripta' za bearer
  tko_tip       TEXT NOT NULL CHECK (tko_tip IN ('admin', 'vlasnik')),
  radnja        TEXT NOT NULL CHECK (radnja IN (
                  'poziv.izdan', 'poziv.opozvan',
                  'korisnik.deaktiviran', 'korisnik.aktiviran',
                  'clanstvo.deaktivirano', 'clanstvo.aktivirano')),
  email         TEXT,                       -- na koga se radnja odnosi
  korisnik_id   INTEGER,
  tenant_id     INTEGER,
  pozivnica_id  INTEGER,
  detalji       TEXT                        -- JSON (uloga, vrsta pozivnice, broj obrisanih sesija…)
);
CREATE INDEX ix_korisnik_aktivnost_tenant ON korisnik_aktivnost (tenant_id, id);
CREATE INDEX ix_korisnik_aktivnost_korisnik ON korisnik_aktivnost (korisnik_id, id);
CREATE INDEX ix_korisnik_aktivnost_email ON korisnik_aktivnost (email, id);
